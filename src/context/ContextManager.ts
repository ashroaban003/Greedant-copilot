/**
 * ContextManager — Central orchestrator for smart context gathering.
 */

import { SelectionProvider } from "./providers/SelectionProvider";
import { ActiveFileProvider } from "./providers/ActiveFileProvider";
import { OpenFilesProvider } from "./providers/OpenFilesProvider";
import { GrepProvider } from "./providers/GrepProvider";
import { TokenBudget } from "./TokenBudget";
import {
  ContextItem,
  ContextPriority,
  BuiltContext,
  SmartKeywordResult,
  FileCandidate,
  MergedFileCandidate,
  FunctionContext,
  FileSkeleton,
  FILE_SCORING,
} from "./types";
import { SmartKeywordExtractor } from "../agent/SmartKeywordExtractor";
import {
  extractFunctionsFromFile,
  extractAllMatchedFunctions,
  formatSkeletonForPrompt,
} from "./utils/functionExtractor";
import {
  getActiveEditorSnapshot,
  getFileInfo,
} from "./utils/fileDiscoveryUtils";
import { extractKeywordsStructured } from "./utils/keywordExtractor";
import { scoreFilenameAgainstKeywords } from "./utils/keywordMatcher";

const CODE_ASSISTANT_INSTRUCTIONS = `## Instructions
- No overtalk or unnecessary or line-by-line explanations.
- Dont repeat selected code back to user
- Show only changed lines or minimal diffs for code fixes
- Explain/Edit should be provided with core code snippet.
- If context is insufficient, report what's missing`;

const MIN_FULL_CONTEXT_BUDGET = 300;
const ENABLE_GREP_SEARCH = true;
const ALWAYS_INCLUDE_ACTIVE_SKELETON = true;

export interface ContextManagerDeps {
  tokenBudget: TokenBudget;
  selectionProvider: SelectionProvider;
  activeFileProvider: ActiveFileProvider;
  openFilesProvider: OpenFilesProvider;
  grepProvider: GrepProvider;
  smartKeywordExtractor?: SmartKeywordExtractor;
}

export class ContextManager {
  private tokenBudget: TokenBudget;
  private selectionProvider: SelectionProvider;
  private activeFileProvider: ActiveFileProvider;
  private openFilesProvider: OpenFilesProvider;
  private grepProvider: GrepProvider;
  private smartKeywordExtractor: SmartKeywordExtractor | null;

  constructor(deps: ContextManagerDeps) {
    this.tokenBudget = deps.tokenBudget;
    this.selectionProvider = deps.selectionProvider;
    this.activeFileProvider = deps.activeFileProvider;
    this.openFilesProvider = deps.openFilesProvider;
    this.grepProvider = deps.grepProvider;
    this.smartKeywordExtractor = deps.smartKeywordExtractor || null;
  }

  /**
   * Set the smart keyword extractor (for late initialization).
   */
  setSmartKeywordExtractor(extractor: SmartKeywordExtractor): void {
    this.smartKeywordExtractor = extractor;
  }

  setContextWindow(size: number): void {
    this.tokenBudget.setContextWindow(size);
  }

  get contextWindow(): number {
    return this.tokenBudget.contextWindow;
  }


  async buildPromptWithContext(
    baseSystemPrompt: string,
    userMessage: string,
    previousAssistantResponse: string | null = null,
    previousUserMessage: string | null = null
  ): Promise<string> {
    // Estimate fixed costs
    const systemTokens = this.tokenBudget.estimateTokens(baseSystemPrompt)
      + this.tokenBudget.estimateTokens(CODE_ASSISTANT_INSTRUCTIONS);
    const userTokens = this.tokenBudget.estimateTokens(userMessage);

    // Estimate previous conversation pair tokens
    let historyTokens = 0;
    if (previousUserMessage) {
      historyTokens += this.tokenBudget.estimateTokens(previousUserMessage);
    }
    if (previousAssistantResponse) {
      historyTokens += this.tokenBudget.estimateTokens(previousAssistantResponse);
    }

    // Calculate available budget for context (returns 0 if insufficient)
    // Include history tokens in the fixed cost calculation
    const availableBudget = this.tokenBudget.calculateAvailableBudget(
      systemTokens + historyTokens,
      userTokens
    );

    // Gather context using new architecture
    const builtContext = await this.gatherAndAssembleContext(userMessage, availableBudget, previousAssistantResponse);

    // Assemble final prompt
    let prompt = `${baseSystemPrompt}\n\n${CODE_ASSISTANT_INSTRUCTIONS}`;

    if (builtContext.content) {
      prompt += `\n\n---\n\n${builtContext.content}`;
    }

    return prompt;
  }

  buildPromptWithDefaultContext(baseSystemPrompt: string): string {
    const selectionContext = this.selectionProvider.getContext();

    let prompt = `${baseSystemPrompt}\n\n${CODE_ASSISTANT_INSTRUCTIONS}`;

    if (selectionContext) {
      prompt += `\n\n---\n\n${selectionContext}`;
    }

    return prompt;
  }

  private async gatherAndAssembleContext(
    userMessage: string,
    availableBudget: number,
    previousAssistantResponse: string | null = null
  ): Promise<BuiltContext> {
    if (availableBudget === 0) {
      return {
        content: "",
        tokensUsed: 0,
        includedItems: [],
        budgetTotal: 0,
      };
    }

    // Get active file info in ONE VS Code API call
    const activeSnapshot = getActiveEditorSnapshot();

    // Extract keywords using smart extractor (with LLM) or fallback
    const keywords = await this.extractKeywords(
      userMessage,
      activeSnapshot.content,
      activeSnapshot.languageId,
      activeSnapshot.selectionText,
      previousAssistantResponse
    );

    // Debug: Log extracted keywords
    console.log("[ContextManager] Keywords for scoring:", { tier1: keywords.tier1.map(k => k.keyword),tier2: keywords.tier2.map(k => `${k.keyword}(${k.score})`) });

    const fileCandidates: FileCandidate[] = [];

    // 1a. Active file (always included) - use snapshot instead of provider
    if (activeSnapshot.filePath && activeSnapshot.content?.trim()) {
      // Base score + keyword-based filename scoring (bypass test filter for active file)
      const fileName = activeSnapshot.filePath.split(/[\\/]/).pop() || "";
      const keywordBonus = scoreFilenameAgainstKeywords(fileName, keywords, true);
      
      fileCandidates.push({
        filePath: activeSnapshot.filePath,
        score: FILE_SCORING.ACTIVE_FILE + keywordBonus,
        source: "active",
      });
    }

    // 1b. Open files
    if (availableBudget > MIN_FULL_CONTEXT_BUDGET) {
      try {
        const openCandidates = this.openFilesProvider.getFileCandidates(keywords);
        fileCandidates.push(...openCandidates);
      } catch {
        // Skip on error
      }
    }

    // 1c. Grep search (async)
    if (ENABLE_GREP_SEARCH && availableBudget > MIN_FULL_CONTEXT_BUDGET &&
        (keywords.tier1.length > 0 || keywords.tier2.length > 0)) {
      try {
        const grepCandidates = await this.grepProvider.getFileCandidates(keywords);
        fileCandidates.push(...grepCandidates);
      } catch {
        // Skip on error
      }
    }

    // PHASE 2: Merge and dedupe file candidates
    const mergedCandidates = this.mergeFileCandidates(fileCandidates);

    // Debug: Log file candidates with scores
    console.log("[ContextManager] File candidates:", mergedCandidates.map(c => ({file: c.filePath.split(/[\\/]/).pop(),score: c.score,sources: c.sources })));

    // PHASE 3: Extract functions from each file
    // Cache file contents to avoid re-reading
    const fileContentCache = new Map<string, { content: string; languageId: string }>();
    
    // Pre-populate cache with active file content (already have it)
    if (activeSnapshot.filePath && activeSnapshot.content && activeSnapshot.languageId) {
      fileContentCache.set(activeSnapshot.filePath, {
        content: activeSnapshot.content,
        languageId: activeSnapshot.languageId,
      });
    }

    const allFunctions: FunctionContext[] = [];
    const skeletons: FileSkeleton[] = [];

    for (const candidate of mergedCandidates) {
      // Check cache first, then fetch
      let fileInfo = fileContentCache.get(candidate.filePath);
      if (!fileInfo) {
        const fetched = await getFileInfo(candidate.filePath);
        if (!fetched) { continue; }
        fileInfo = fetched;
        fileContentCache.set(candidate.filePath, fileInfo);
      }

      const isActiveFile = candidate.sources.includes("active");
      const cursorLine = isActiveFile ? (activeSnapshot.cursorLine ?? undefined) : undefined;

      const extraction = extractFunctionsFromFile(
        candidate.filePath,
        fileInfo.content,
        fileInfo.languageId,
        keywords,
        candidate.score,
        cursorLine
      );

      if (isActiveFile && ALWAYS_INCLUDE_ACTIVE_SKELETON) {
        skeletons.push(extraction.skeleton);
      }

      if (candidate.matchLines && candidate.matchLines.length > 0) {
        // Grouping by enclosing function
        const matchedFunctions = extractAllMatchedFunctions(
          candidate.filePath,
          fileInfo.content,
          fileInfo.languageId,
          candidate.matchLines,
          keywords,
          candidate.score
        );
        allFunctions.push(...matchedFunctions);
      } else {
        // Add all extracted functions
        allFunctions.push(...extraction.functions);
      }
    }

    // PHASE 4: Get selection context (highest priority)
    const selectionContent = this.selectionProvider.getContext();

    // PHASE 5: Rank functions globally and fit to budget
    // Build open file paths set once for assembleContext
    const openFilePaths = new Set(
      mergedCandidates
        .filter(c => c.sources.includes("open"))
        .map(c => c.filePath)
    );

    return this.assembleContext(
      selectionContent,
      skeletons,
      allFunctions,
      openFilePaths,
      availableBudget
    );
  }

  private mergeFileCandidates(candidates: FileCandidate[]): MergedFileCandidate[] {
    const fileMap = new Map<string, MergedFileCandidate>();

    for (const candidate of candidates) {
      const existing = fileMap.get(candidate.filePath);

      if (existing) {
        // Merge: combine scores, add source, merge match lines
        existing.score = Math.max(existing.score, candidate.score);
        if (!existing.sources.includes(candidate.source)) {
          existing.sources.push(candidate.source);
        }
        if (candidate.matchLines) {
          existing.matchLines = existing.matchLines || [];
          for (const line of candidate.matchLines) {
            if (!existing.matchLines.includes(line)) {
              existing.matchLines.push(line);
            }
          }
        }
      } else {
        // New file
        fileMap.set(candidate.filePath, {
          filePath: candidate.filePath,
          score: candidate.score,
          sources: [candidate.source],
          matchLines: candidate.matchLines ? [...candidate.matchLines] : undefined,
        });
      }
    }

    // Sort by score descending, but keep active file first
    return Array.from(fileMap.values()).sort((a, b) => {
      const aIsActive = a.sources.includes("active");
      const bIsActive = b.sources.includes("active");
      if (aIsActive && !bIsActive) { return -1; }
      if (!aIsActive && bIsActive) { return 1; }
      return b.score - a.score;
    });
  }

  private assembleContext(
    selectionContent: string | null,
    skeletons: FileSkeleton[],
    functions: FunctionContext[],
    openFilePaths: Set<string>,
    availableBudget: number
  ): BuiltContext {
    const includedItems: ContextItem[] = [];
    let tokensUsed = 0;
    const contentParts: string[] = [];

    // 1. Selection context (highest priority, always first)
    if (selectionContent) {
      const selectionTokens = this.tokenBudget.estimateTokens(selectionContent);
      const maxSelectionBudget = Math.floor(availableBudget * 0.3);

      let finalSelection = selectionContent;
      let finalSelectionTokens = selectionTokens;

      if (selectionTokens > maxSelectionBudget) {
        // Truncate selection
        const maxChars = Math.floor(maxSelectionBudget * 3.5);
        finalSelection = selectionContent.slice(0, maxChars) + "\n...(truncated)";
        finalSelectionTokens = this.tokenBudget.estimateTokens(finalSelection);
      }

      contentParts.push(finalSelection);
      tokensUsed += finalSelectionTokens;

      includedItems.push({
        source: "selection",
        priority: ContextPriority.Selection,
        relevanceScore: 100,
        content: finalSelection,
        tokenCount: finalSelectionTokens,
        label: "Editor Selection",
      });
    }

    // 2. Active file skeleton (if available)
    for (const skeleton of skeletons) {
      const skeletonContent = formatSkeletonForPrompt(skeleton);
      const skeletonTokens = this.tokenBudget.estimateTokens(skeletonContent);

      if (tokensUsed + skeletonTokens <= availableBudget) {
        contentParts.push(skeletonContent);
        tokensUsed += skeletonTokens;

        includedItems.push({
          source: "activeFile",
          priority: ContextPriority.ActiveFile,
          relevanceScore: 50,
          content: skeletonContent,
          tokenCount: skeletonTokens,
          filePath: skeleton.filePath,
          label: `Skeleton: ${skeleton.fileName}`,
        });
      }
    }

    // 3. Group functions by file and merge overlapping ranges
    const groupedByFile = this.groupAndMergeFunctions(functions);

    // Sort files by best function score
    const sortedFiles = Array.from(groupedByFile.entries())
      .map(([filePath, data]) => ({
        filePath,
        fileName: data.fileName,
        ranges: data.ranges,
        bestScore: Math.max(...data.ranges.map(r => r.score)),
      }))
      .sort((a, b) => b.bestScore - a.bestScore);

    // Build skeleton file paths set for active file detection
    const skeletonFilePaths = new Set(skeletons.map(s => s.filePath));

    let filesIncluded = 0;
    const MAX_FILES_IN_CONTEXT = 8;

    for (const fileGroup of sortedFiles) {
      if (filesIncluded >= MAX_FILES_IN_CONTEXT) { break; }

      // Format as single block: "// fileName\n<merged content>"
      const fileContent = this.formatFileGroup(fileGroup.fileName, fileGroup.ranges);
      const fileTokens = this.tokenBudget.estimateTokens(fileContent);

      if (tokensUsed + fileTokens <= availableBudget) {
        contentParts.push(fileContent);
        tokensUsed += fileTokens;
        filesIncluded++;

        // Determine priority and source
        let priority = ContextPriority.GrepSearch;
        let source = "grep";

        if (skeletonFilePaths.has(fileGroup.filePath)) {
          priority = ContextPriority.ActiveFile;
          source = "activeFile";
        } else if (openFilePaths.has(fileGroup.filePath)) {
          priority = ContextPriority.OpenFiles;
          source = "openFiles";
        }

        const functionNames = fileGroup.ranges.map(r => r.name).join(", ");
        includedItems.push({
          source,
          priority,
          relevanceScore: fileGroup.bestScore,
          content: fileContent,
          tokenCount: fileTokens,
          filePath: fileGroup.filePath,
          label: `${fileGroup.fileName}: ${functionNames}`,
        });
      } else if (availableBudget - tokensUsed > 100) {
        // Try truncated version
        const budgetLeft = availableBudget - tokensUsed;
        const maxChars = Math.floor(budgetLeft * 3.5) - 30;
        if (maxChars > 100) {
          const truncated = fileContent.slice(0, maxChars) + "\n// ...(truncated)";
          const truncatedTokens = this.tokenBudget.estimateTokens(truncated);

          contentParts.push(truncated);
          tokensUsed += truncatedTokens;
          filesIncluded++;

          let truncSource = "grep";
          let truncPriority = ContextPriority.GrepSearch;
          if (openFilePaths.has(fileGroup.filePath)) {
            truncSource = "openFiles";
            truncPriority = ContextPriority.OpenFiles;
          }

          includedItems.push({
            source: truncSource,
            priority: truncPriority,
            relevanceScore: fileGroup.bestScore,
            content: truncated,
            tokenCount: truncatedTokens,
            filePath: fileGroup.filePath,
            label: `${fileGroup.fileName} (truncated)`,
          });
        }
        break; // Budget exhausted
      }
    }

    const finalContent = contentParts.join("\n\n---\n\n");

    return {
      content: finalContent,
      tokensUsed,
      includedItems,
      budgetTotal: availableBudget,
    };
  }

  /**
   * Group functions by file and merge overlapping line ranges.
   */
  private groupAndMergeFunctions(
    functions: FunctionContext[]
  ): Map<string, { fileName: string; ranges: Array<{ name: string; startLine: number; endLine: number; content: string; score: number }> }> {
    const fileMap = new Map<string, {
      fileName: string;
      lines: string[];
      rawRanges: Array<{ name: string; startLine: number; endLine: number; score: number }>;
    }>();

    // Group by file and collect line ranges
    for (const fn of functions) {
      let fileData = fileMap.get(fn.filePath);
      if (!fileData) {
        const contentLines = fn.content.split("\n");
        // Estimate end line from content
        const endLine = fn.startLine + contentLines.length - 1;
        fileData = {
          fileName: fn.fileName,
          lines: [], // Will be populated during merge
          rawRanges: [],
        };
        fileMap.set(fn.filePath, fileData);
      }

      // Calculate end line from content
      const contentLines = fn.content.split("\n");
      const endLine = fn.startLine + contentLines.length - 1;

      fileData.rawRanges.push({
        name: fn.functionName,
        startLine: fn.startLine,
        endLine,
        score: fn.score,
      });
    }

    // Merge overlapping ranges for each file
    const result = new Map<string, { fileName: string; ranges: Array<{ name: string; startLine: number; endLine: number; content: string; score: number }> }>();

    for (const [filePath, fileData] of fileMap) {
      const mergedRanges = this.mergeOverlappingRanges(fileData.rawRanges);

      // Find the function content for each merged range
      // We need to get content from original functions
      const functionsForFile = functions.filter(f => f.filePath === filePath);
      
      const rangesWithContent = mergedRanges.map(range => {
        // Find all functions that fall within this merged range
        const overlappingFns = functionsForFile.filter(
          f => f.startLine >= range.startLine && f.startLine <= range.endLine
        );
        
        // Use the content from the function with lowest startLine (covers most)
        // or combine if truly separate within the merged range
        if (overlappingFns.length === 1) {
          return {
            name: range.names.join(", "),
            startLine: range.startLine,
            endLine: range.endLine,
            content: overlappingFns[0].content,
            score: range.bestScore,
          };
        }

        // Multiple functions merged - combine their content, removing duplicates
        const sortedFns = [...overlappingFns].sort((a, b) => a.startLine - b.startLine);
        const combinedContent = this.combineNonOverlappingContent(sortedFns);
        
        return {
          name: range.names.join(", "),
          startLine: range.startLine,
          endLine: range.endLine,
          content: combinedContent,
          score: range.bestScore,
        };
      });

      result.set(filePath, {
        fileName: fileData.fileName,
        ranges: rangesWithContent,
      });
    }

    return result;
  }

  /**
   * Merge overlapping line ranges using sliding window approach.
   */
  private mergeOverlappingRanges(
    ranges: Array<{ name: string; startLine: number; endLine: number; score: number }>
  ): Array<{ names: string[]; startLine: number; endLine: number; bestScore: number }> {
    if (ranges.length === 0) { return []; }

    // Sort by start line
    const sorted = [...ranges].sort((a, b) => a.startLine - b.startLine);

    const merged: Array<{ names: string[]; startLine: number; endLine: number; bestScore: number }> = [];
    let current = {
      names: [sorted[0].name],
      startLine: sorted[0].startLine,
      endLine: sorted[0].endLine,
      bestScore: sorted[0].score,
    };

    for (let i = 1; i < sorted.length; i++) {
      const next = sorted[i];

      // Check for overlap (with small gap tolerance of 2 lines)
      if (next.startLine <= current.endLine + 2) {
        // Merge: extend range, add name, update best score
        current.endLine = Math.max(current.endLine, next.endLine);
        if (!current.names.includes(next.name)) {
          current.names.push(next.name);
        }
        current.bestScore = Math.max(current.bestScore, next.score);
      } else {
        // No overlap - save current and start new
        merged.push(current);
        current = {
          names: [next.name],
          startLine: next.startLine,
          endLine: next.endLine,
          bestScore: next.score,
        };
      }
    }

    // Don't forget the last one
    merged.push(current);

    return merged;
  }

  /**
   * Combine content from multiple functions, avoiding duplicate lines.
   */
  private combineNonOverlappingContent(sortedFns: FunctionContext[]): string {
    if (sortedFns.length === 0) { return ""; }
    if (sortedFns.length === 1) { return sortedFns[0].content; }

    const result: string[] = [];
    let lastEndLine = -1;

    for (const fn of sortedFns) {
      const fnLines = fn.content.split("\n");
      const fnEndLine = fn.startLine + fnLines.length - 1;

      if (fn.startLine > lastEndLine) {
        // No overlap - add separator if not first
        if (result.length > 0) {
          result.push(""); // Empty line separator
        }
        result.push(...fnLines);
      } else {
        // Overlap - only add lines after lastEndLine
        const skipLines = lastEndLine - fn.startLine + 1;
        if (skipLines < fnLines.length) {
          result.push(...fnLines.slice(skipLines));
        }
      }

      lastEndLine = Math.max(lastEndLine, fnEndLine);
    }

    return result.join("\n");
  }

  /**
   * Format a file group as a single content block.
   */
  private formatFileGroup(
    fileName: string,
    ranges: Array<{ name: string; content: string }>
  ): string {
    const header = `// ${fileName}`;
    const blocks = ranges.map(r => r.content);
    
    // Join blocks with a visual separator if multiple
    if (blocks.length === 1) {
      return `${header}\n${blocks[0]}`;
    }
    
    return `${header}\n${blocks.join("\n\n// ---\n\n")}`;
  }

  /**
   * Extract keywords using SmartKeywordExtractor or fallback.
   */
  private async extractKeywords(
    userMessage: string,
    activeFileContent: string | null,
    languageId: string | null,
    selectionText: string | null = null,
    previousAssistantResponse: string | null = null
  ): Promise<SmartKeywordResult> {
    // Try smart extraction if available
    if (this.smartKeywordExtractor) {
      try {
        return await this.smartKeywordExtractor.extract(
          userMessage,
          activeFileContent,
          languageId || "typescript",
          selectionText,
          previousAssistantResponse
        );
      } catch {
        // Fall through to basic extraction
      }
    }

    // Fallback: basic keyword extraction (no LLM)
    const { primary, derived } = extractKeywordsStructured(userMessage);

    return {
      tier1: primary.map(kw => ({ keyword: kw, score: 100 as const })),
      tier2: derived.map((kw, i) => ({ keyword: kw, score: Math.max(50, 80 - i * 10) })),
    };
  }
}
