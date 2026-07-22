/**
 * ContextManager — Central orchestrator for smart context gathering.
 *
 * Coordinates all context providers, applies token budgeting, and
 * assembles the final prompt with context for the LLM.
 *
 * Flow:
 * 1. Calculate available token budget (from model's context window)
 * 2. Gather context from all providers in parallel
 * 3. Rank and fit items into budget
 * 4. Assemble final prompt: system instructions + context + user message
 *
 * Adapts automatically to any context window size (2K, 4K, 8K, 32K).
 */

import { SelectionProvider } from "./providers/SelectionProvider";
import { ActiveFileProvider } from "./providers/ActiveFileProvider";
import { OpenFilesProvider } from "./providers/OpenFilesProvider";
import { GrepProvider } from "./providers/GrepProvider";
import { TokenBudget } from "./TokenBudget";
import { ContextRanker } from "./ContextRanker";
import { ContextItem, ContextPriority, BudgetAllocation, BuiltContext } from "./types";
import { extractKeywords } from "./utils/keywordExtractor";

/** System instructions for code assistance (compact for local models) */
const CODE_ASSISTANT_INSTRUCTIONS = `## Instructions
- No overtalk or unnecessary or line-by-line explanations.
- Dont repeat selected code back to user
- Show only changed lines or minimal diffs for code fixes
- Explain/Edit should be provided with core code snippet.
- If context is insufficient, report what's missing`;

/** Minimum context budget below which we only use selection */
const MIN_FULL_CONTEXT_BUDGET = 300;

/** Enable/disable workspace grep search */
const ENABLE_GREP_SEARCH = true;

export class ContextManager {
  private selectionProvider: SelectionProvider;
  private activeFileProvider: ActiveFileProvider;
  private openFilesProvider: OpenFilesProvider;
  private grepProvider: GrepProvider;
  private tokenBudget: TokenBudget;
  private ranker: ContextRanker;

  constructor(selectionProvider: SelectionProvider) {
    this.tokenBudget = new TokenBudget();
    this.selectionProvider = selectionProvider;
    this.activeFileProvider = new ActiveFileProvider(this.tokenBudget);
    this.openFilesProvider = new OpenFilesProvider(this.tokenBudget);
    this.grepProvider = new GrepProvider(this.tokenBudget);
    this.ranker = new ContextRanker(this.tokenBudget);
  }

  /**
   * Update the context window size (call when model info is fetched).
   */
  setContextWindow(size: number): void {
    this.tokenBudget.setContextWindow(size);
  }

  /**
   * Get the current context window size.
   */
  get contextWindow(): number {
    return this.tokenBudget.contextWindow;
  }

  /**
   * Build the complete enhanced prompt with smart context.
   *
   * This is the main entry point called by ChatService.
   * It gathers context from all providers, ranks it, and fits it
   * within the token budget.
   */
  async buildPromptWithContext(
    baseSystemPrompt: string,
    userMessage: string
  ): Promise<string> {
    // Estimate fixed costs
    const systemTokens = this.tokenBudget.estimateTokens(baseSystemPrompt)
      + this.tokenBudget.estimateTokens(CODE_ASSISTANT_INSTRUCTIONS);
    const userTokens = this.tokenBudget.estimateTokens(userMessage);

    // Calculate available budget for context
    const availableBudget = this.tokenBudget.calculateAvailableBudget(
      systemTokens,
      userTokens
    );

    // If budget is too small, return minimal prompt
    if (availableBudget <= 50) {
      return `${baseSystemPrompt}\n\n${CODE_ASSISTANT_INSTRUCTIONS}`;
    }

    // Gather context
    const builtContext = await this.gatherAndRankContext(userMessage, availableBudget);

    // Assemble final prompt
    let prompt = `${baseSystemPrompt}\n\n${CODE_ASSISTANT_INSTRUCTIONS}`;

    if (builtContext.content) {
      prompt += `\n\n---\n\n${builtContext.content}`;
    }

    return prompt;
  }

  /**
   * Legacy sync method for backward compatibility.
   * Used when userMessage is not available (e.g., initial prompt building).
   */
  buildPromptWithContextSync(baseSystemPrompt: string): string {
    const selectionContext = this.selectionProvider.getContext();

    let prompt = `${baseSystemPrompt}\n\n${CODE_ASSISTANT_INSTRUCTIONS}`;

    if (selectionContext) {
      prompt += `\n\n---\n\n${selectionContext}`;
    }

    return prompt;
  }

  /**
   * Gather context from all providers and rank/fit into budget.
   * 
   * Strategy: Gather generously from all providers (up to 2x their allocation),
   * then let the ranker do final trimming. This allows unused budget from
   * one provider to flow to others during the greedy fit phase.
   */
  private async gatherAndRankContext(
    userMessage: string,
    availableBudget: number
  ): Promise<BuiltContext> {
    const allocation = this.tokenBudget.allocate(availableBudget);
    const keywords = extractKeywords(userMessage);
    const items: ContextItem[] = [];

    console.log(`[ContextManager] Budget: ${availableBudget}, Keywords: [${keywords.join(", ")}]`);
    console.log(`[ContextManager] Allocation: selection=${allocation.selection}, activeFile=${allocation.activeFile}, openFiles=${allocation.openFiles}, grep=${allocation.grepSearch}`);

    // Gather generously — each provider can collect up to 2x its share.
    // The ranker will trim to fit the actual total budget.
    const GATHER_MULTIPLIER = 2;

    // 1. Selection context (highest priority, always include)
    const selectionItem = this.getSelectionItem(allocation.selection * GATHER_MULTIPLIER);
    if (selectionItem) {
      items.push(selectionItem);
      console.log(`[ContextManager] Selection: ${selectionItem.tokenCount} tokens`);
    }

    // 2. Active file structure
    if (availableBudget > MIN_FULL_CONTEXT_BUDGET) {
      try {
        const activeItem = this.activeFileProvider.getContext(allocation.activeFile * GATHER_MULTIPLIER);
        if (activeItem) {
          items.push(activeItem);
          console.log(`[ContextManager] ActiveFile: ${activeItem.tokenCount} tokens - ${activeItem.label}`);
        } else {
          console.log(`[ContextManager] ActiveFile: null`);
        }
      } catch (e) {
        console.log(`[ContextManager] ActiveFile error: ${e}`);
      }
    }

    // 3. Open files (only if we have meaningful budget left)
    if (availableBudget > MIN_FULL_CONTEXT_BUDGET) {
      try {
        const openItems = this.openFilesProvider.getContext(keywords, allocation.openFiles * GATHER_MULTIPLIER);
        items.push(...openItems);
        console.log(`[ContextManager] OpenFiles: ${openItems.length} items, ${openItems.reduce((s, i) => s + i.tokenCount, 0)} tokens`);
        openItems.forEach(item => console.log(`  - ${item.label} (score: ${item.relevanceScore})`));
      } catch (e) {
        console.log(`[ContextManager] OpenFiles error: ${e}`);
      }
    }

    // 4. Grep search (async, only if enabled and budget allows)
    if (ENABLE_GREP_SEARCH && availableBudget > MIN_FULL_CONTEXT_BUDGET && keywords.length > 0) {
      try {
        console.log(`[ContextManager] Starting grep search...`);
        const grepItems = await this.grepProvider.getContext(keywords, allocation.grepSearch * GATHER_MULTIPLIER);
        items.push(...grepItems);
        console.log(`[ContextManager] Grep: ${grepItems.length} items, ${grepItems.reduce((s, i) => s + i.tokenCount, 0)} tokens`);
        grepItems.forEach(item => console.log(`  - ${item.label} (score: ${item.relevanceScore})`));
      } catch (e) {
        console.log(`[ContextManager] Grep error: ${e}`);
      }
    } else {
      console.log(`[ContextManager] Grep skipped: enabled=${ENABLE_GREP_SEARCH}, budget=${availableBudget}, keywords=${keywords.length}`);
    }

    console.log(`[ContextManager] Total items before ranking: ${items.length}`);

    // Rank and fit all items into total budget.
    // Items are sorted by priority, so if selection is small,
    // more grep/open file content will fit in the remaining space.
    const result = this.ranker.rankAndFit(items, availableBudget);
    console.log(`[ContextManager] After ranking: ${result.includedItems.length} items, ${result.tokensUsed} tokens used`);

    return result;
  }

  /**
   * Convert SelectionProvider output to a ContextItem.
   */
  private getSelectionItem(maxTokens: number): ContextItem | null {
    const selectionContent = this.selectionProvider.getContext();
    if (!selectionContent) {
      return null;
    }

    const tokenCount = this.tokenBudget.estimateTokens(selectionContent);

    // Truncate if exceeds budget
    let content = selectionContent;
    if (tokenCount > maxTokens && maxTokens > 0) {
      const maxChars = Math.floor(maxTokens * 3.5);
      content = selectionContent.slice(0, maxChars) + "\n...(truncated)";
    }

    return {
      source: "selection",
      priority: ContextPriority.Selection,
      relevanceScore: 100, // Always top priority
      content,
      tokenCount: this.tokenBudget.estimateTokens(content),
      label: "Editor Selection",
    };
  }
}
