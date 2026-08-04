import { extractFileStructure, CodeSymbol } from "../ASTLite";
import { SmartKeywordResult, FunctionContext, FileSkeleton, FileExtractionResult } from "../types";
import { scoreFunctionName, scoreContentAgainstKeywords } from "./keywordMatcher";
import { findBlockEnd } from "./codeBlockUtils";
import { getFileName } from "./textUtils";

/** Threshold for high relevance functions that get full body extraction */
const HIGH_RELEVANCE_THRESHOLD = 100;
const HIGH_RELEVANCE_MAX_LINES = 40;
const LOW_RELEVANCE_MAX_LINES = 8;
const MAX_FUNCTIONS_PER_FILE = 10;

const CONTEXT_LINES_BEFORE = 3;
const CONTEXT_LINES_AFTER = 4;

const SNIPPET_CONTEXT_BEFORE = 2;
const SNIPPET_CONTEXT_AFTER = 2;

const FUZZY_THRESHOLD = 0.7;
const MAX_OUTPUT_LINES = 70;
const LENGTH_TOLERANCE = 5;

interface MatchGroup {
  matchLines: number[];
  enclosingFunction: CodeSymbol | null;
  regionStart: number;
  regionEnd: number;
}

export function extractFunctionsFromFile(
  filePath: string,
  content: string,
  languageId: string,
  keywords: SmartKeywordResult,
  baseScore: number = 0,
  cursorLine?: number
): FileExtractionResult {
  const fileName = getFileName(filePath);
  const lines = content.split("\n");
  const structure = extractFileStructure(content, languageId);
  const skeleton: FileSkeleton = {
    filePath,
    fileName,
    skeleton: structure.skeleton,
    languageId,
  };
  const functionSymbols = structure.symbols.filter(
    (s) => s.type === "function" || s.type === "class" || s.type === "interface"
  );

  // Score and extract each function
  const scoredFunctions: FunctionContext[] = [];
  for (const symbol of functionSymbols) {
    const functionScore = calculateFunctionScore(
      symbol,
      lines,
      keywords,
      baseScore,
      cursorLine
    );

    const isHighRelevance = functionScore >= HIGH_RELEVANCE_THRESHOLD;
    const maxLines = isHighRelevance ? HIGH_RELEVANCE_MAX_LINES : LOW_RELEVANCE_MAX_LINES;

    const { content: funcContent, endLine } = extractFunctionContent(
      lines,
      symbol.line,
      maxLines,
      isHighRelevance
    );

    scoredFunctions.push({
      filePath,
      fileName,
      functionName: symbol.name,
      content: funcContent,
      startLine: symbol.line,
      score: functionScore,
    });
  }

  // Sort by score descending and limit
  scoredFunctions.sort((a, b) => b.score - a.score);
  const topFunctions = scoredFunctions.slice(0, MAX_FUNCTIONS_PER_FILE);

  return {
    skeleton,
    functions: topFunctions,
    symbols: structure.symbols,
  };
}

function calculateFunctionScore(
  symbol: CodeSymbol,
  lines: string[],
  keywords: SmartKeywordResult,
  baseScore: number,
  cursorLine?: number
): number {
  let score = baseScore;
  score += scoreFunctionName(symbol.name, keywords);
  score += scoreContentAgainstKeywords(symbol.signature, keywords);

  // Score function body content (sample first few lines)
  const bodyStart = symbol.line + 1;
  const bodyEnd = Math.min(bodyStart + 10, lines.length);
  const bodySample = lines.slice(bodyStart, bodyEnd).join(" ");
  score += scoreContentAgainstKeywords(bodySample, keywords) * 0.5; 

  if (cursorLine !== undefined) {
    const distance = Math.abs(symbol.line - cursorLine);
    if (distance === 0) {
      score += 80; // Cursor is on this function
    } else if (distance <= 5) {
      score += 50; // Very close
    } else if (distance <= 20) {
      score += 20; // Nearby
    }
  }

  return Math.round(score);
}

function extractFunctionContent(
  lines: string[],
  startLine: number,
  maxLines: number,
  includeFullBody: boolean
): { content: string; endLine: number } {
  if (startLine >= lines.length) {
    return { content: "", endLine: startLine };
  }
  const actualEnd = findBlockEnd(lines, startLine, maxLines + 20);
  const effectiveEnd = Math.min(actualEnd, startLine + maxLines);
  const extractedLines = lines.slice(startLine, effectiveEnd + 1);

  let content: string;

  if (includeFullBody) {
    content = extractedLines.join("\n");
    if (effectiveEnd < actualEnd) {
      content += "\n  // ... (truncated)";
    }
  } else {
    if (extractedLines.length > maxLines) {
      content = extractedLines.slice(0, maxLines).join("\n");
      content += "\n  // ... (truncated)";
    } else {
      content = extractedLines.join("\n");
    }
  }

  return { content, endLine: effectiveEnd };
}

function findEnclosingFunction(
  symbols: CodeSymbol[],
  targetLine: number
): CodeSymbol | null {
  const functions = symbols
    .filter((s) => s.type === "function" || s.type === "class")
    .sort((a, b) => b.line - a.line);
  return functions.find((f) => f.line <= targetLine) || null;
}

export function formatFunctionForPrompt(fn: FunctionContext): string {
  const header = `// ${fn.fileName} - ${fn.functionName}`;
  return `${header}\n${fn.content}`;
}

function groupMatchLinesByContext(
  matchLines: number[],
  symbols: CodeSymbol[],
  totalLines: number
): MatchGroup[] {
  if (matchLines.length === 0) {
    return [];
  }
  const sortedLines = [...matchLines].sort((a, b) => a - b);
  const functions = symbols
    .filter((s) => s.type === "function" || s.type === "class")
    .sort((a, b) => b.line - a.line);

  // Helper to find enclosing function for a line - O(f) where f = num functions
  const getEnclosingFunction = (line: number): CodeSymbol | null => {
    return functions.find((f) => f.line <= line) || null;
  };

  // Group by enclosing function, merging overlapping non-function regions
  const groups: MatchGroup[] = [];
  let currentGroup: MatchGroup | null = null;

  for (const line of sortedLines) {
    const enclosingFn = getEnclosingFunction(line);

    if (enclosingFn) {
      // Line is inside a function
      if (currentGroup && currentGroup.enclosingFunction?.line === enclosingFn.line) {
        // Same function as current group - add to it
        currentGroup.matchLines.push(line);
      } else {
        // Different function - start new group
        if (currentGroup) {
          groups.push(currentGroup);
        }
        currentGroup = {
          matchLines: [line],
          enclosingFunction: enclosingFn,
          regionStart: enclosingFn.line,
          regionEnd: -1, // Will be calculated during extraction
        };
      }
    } else {
      // Line is NOT inside a function - use context-based region
      const regionStart = Math.max(0, line - CONTEXT_LINES_BEFORE);
      const regionEnd = Math.min(totalLines - 1, line + CONTEXT_LINES_AFTER);

      if (currentGroup && !currentGroup.enclosingFunction) {
        // Current group is also context-based - check for overlap
        if (regionStart <= currentGroup.regionEnd + 1) {
          currentGroup.matchLines.push(line);
          currentGroup.regionEnd = Math.max(currentGroup.regionEnd, regionEnd);
        } else {
          // No overlap - start new group
          groups.push(currentGroup);
          currentGroup = {
            matchLines: [line],
            enclosingFunction: null,
            regionStart,
            regionEnd,
          };
        }
      } else {
        // Current group is function-based or doesn't exist - start new context group
        if (currentGroup) {
          groups.push(currentGroup);
        }
        currentGroup = {
          matchLines: [line],
          enclosingFunction: null,
          regionStart,
          regionEnd,
        };
      }
    }
  }

  // Don't forget the last group
  if (currentGroup) {
    groups.push(currentGroup);
  }

  return groups;
}

export function extractAllMatchedFunctions(
  filePath: string,
  content: string,
  languageId: string,
  matchLines: number[],
  keywords: SmartKeywordResult,
  baseScore: number
): FunctionContext[] {
  if (matchLines.length === 0) {
    return [];
  }

  const fileName = getFileName(filePath);
  const lines = content.split("\n");
  const structure = extractFileStructure(content, languageId);

  // Group match lines by function/context - O(n log n)
  const groups = groupMatchLinesByContext(matchLines, structure.symbols, lines.length);

  const results: FunctionContext[] = [];

  // Extract each group - O(groups * extraction cost)
  for (const group of groups) {
    if (group.enclosingFunction) {
      // Function-based extraction
      const fn = group.enclosingFunction;
      const multiMatchBonus = Math.min((group.matchLines.length - 1) * 10, 30);
      const functionScore = baseScore + scoreFunctionName(fn.name, keywords) + multiMatchBonus;
      const isHighRelevance = functionScore >= HIGH_RELEVANCE_THRESHOLD;
      const maxLines = isHighRelevance ? HIGH_RELEVANCE_MAX_LINES : LOW_RELEVANCE_MAX_LINES;

      const { content: funcContent, endLine } = extractFunctionContent(
        lines,
        fn.line,
        maxLines,
        isHighRelevance
      );

      // Mark all match lines
      const funcLines = funcContent.split("\n");
      for (const matchLine of group.matchLines) {
        if (matchLine >= fn.line && matchLine <= endLine) {
          const relativeLine = matchLine - fn.line;
          if (relativeLine >= 0 && relativeLine < funcLines.length) {
            if (!funcLines[relativeLine].startsWith("> ")) {
              funcLines[relativeLine] = `> ${funcLines[relativeLine]}`;
            }
          }
        }
      }

      results.push({
        filePath,
        fileName,
        functionName: fn.name,
        content: funcLines.join("\n"),
        startLine: fn.line,
        score: functionScore,
      });
    } else {
      // Context-based extraction (merged regions)
      const contextLines = lines.slice(group.regionStart, group.regionEnd + 1);

      // Mark all match lines
      for (const matchLine of group.matchLines) {
        const relativeLine = matchLine - group.regionStart;
        if (relativeLine >= 0 && relativeLine < contextLines.length) {
          if (!contextLines[relativeLine].startsWith("> ")) {
            contextLines[relativeLine] = `> ${contextLines[relativeLine]}`;
          }
        }
      }

      const multiMatchBonus = Math.min((group.matchLines.length - 1) * 10, 30);
      const primaryLine = group.matchLines[0];

      results.push({
        filePath,
        fileName,
        functionName: `(lines ${group.regionStart + 1}-${group.regionEnd + 1})`,
        content: contextLines.join("\n"),
        startLine: group.regionStart,
        score: baseScore + scoreContentAgainstKeywords(lines[primaryLine] || "", keywords) + multiMatchBonus,
      });
    }
  }

  return results;
}

export function formatSkeletonForPrompt(skeleton: FileSkeleton): string {
  return `## ${skeleton.fileName}\n${skeleton.skeleton}`;
}

function similarity(a: string, b: string): number {
  const s1 = a.toLowerCase(), s2 = b.toLowerCase();
  if (s1 === s2) return 1;
  if (!s1.length || !s2.length) return 0;
  
  const maxLen = Math.max(s1.length, s2.length);
  if (Math.abs(s1.length - s2.length) / maxLen > 0.5) return 0;
  
  let prev = Array.from({ length: s1.length + 1 }, (_, i) => i);
  for (let j = 1; j <= s2.length; j++) {
    const curr = [j];
    for (let i = 1; i <= s1.length; i++) {
      curr[i] = Math.min(
        prev[i] + 1,
        curr[i - 1] + 1,
        prev[i - 1] + (s1[i - 1] === s2[j - 1] ? 0 : 1)
      );
    }
    prev = curr;
  }
  return 1 - prev[s1.length] / maxLen;
}

/** Extract all unique identifiers from content (with camelCase splitting) */
function buildIdentifierSet(content: string): Set<string> {
  const ids = new Set<string>();
  for (const m of content.match(/[a-zA-Z_$][a-zA-Z0-9_$]*/g) || []) {
    if (m.length >= 2) ids.add(m);
    // Split camelCase/PascalCase
    const parts = m.split(/(?=[A-Z])|_/).filter(p => p.length >= 2);
    for (const p of parts) ids.add(p);
  }
  return ids;
}

function resolveKeyword(
  keyword: string,
  identifiers: Set<string>
): string[] {
  const kwL = keyword.toLowerCase();
  
  // Track matches by quality tier
  let exactMatch: string | null = null;
  const fuzzyMatches: { id: string; score: number }[] = [];
  const substringMatches: { id: string; score: number }[] = [];
  
  for (const id of identifiers) {
    const idL = id.toLowerCase();
    
    // Exact match (case-insensitive) - highest priority
    if (idL === kwL) {
      exactMatch = id;
      break; // Can't do better than exact
    }
    
    // Fuzzy match (only if length is close and keyword is long enough)
    if (kwL.length >= 6 && Math.abs(id.length - keyword.length) <= LENGTH_TOLERANCE) {
      const sim = similarity(kwL, idL);
      if (sim >= FUZZY_THRESHOLD) {
        fuzzyMatches.push({ id, score: sim });
      }
    }
    if (idL.includes(kwL) && kwL.length >= 4 && idL.length >= kwL.length) {
      substringMatches.push({ id, score: 0.75 });
    }
  }
  
  // Return by priority: exact > fuzzy > substring
  if (exactMatch) {
    return [exactMatch];
  }
  
  if (fuzzyMatches.length > 0) {
    // Return best fuzzy matches only (ignore substring matches)
    fuzzyMatches.sort((a, b) => b.score - a.score);
    const bestScore = fuzzyMatches[0].score;
    return fuzzyMatches
      .filter(m => m.score >= bestScore - 0.05)
      .slice(0, 2)
      .map(m => m.id);
  }
  
  if (substringMatches.length > 0) {
    // Return substring matches, prefer longer identifiers (more specific)
    substringMatches.sort((a, b) => b.id.length - a.id.length);
    return substringMatches.slice(0, 2).map(m => m.id);
  }
  
  return [];
}

export function findRelevantContent(
  content: string | null,
  languageId: string,
  keywords: string[],
  _maxChars: number = 1500
): string | null {
  if (!content || !keywords.length) return null;
  
  const lines = content.split("\n");
  const validKeywords = keywords.filter(k => k.length >= 4);
  if (!validKeywords.length) return null;
  
  const identifiers = buildIdentifierSet(content);
  
  const allResolved = new Set<string>();
  for (const kw of validKeywords) {
    for (const resolved of resolveKeyword(kw, identifiers)) {
      allResolved.add(resolved);
    }
  }
  
  if (!allResolved.size) {
    const { symbols } = extractFileStructure(content, languageId);
    return fallbackSnippet(symbols, lines);
  }
  
  const matchedLines = findMatchingLinesWithFlag(lines, [...allResolved]);
  
  if (!matchedLines.length) {
    const { symbols } = extractFileStructure(content, languageId);
    return fallbackSnippet(symbols, lines);
  }
  
  const outputLines = collectLinesWithContext(lines, matchedLines);
  return outputLines.join("\n");
}

function findMatchingLinesWithFlag(
  lines: string[],
  resolvedIds: string[]
): Array<{ lineNum: number; isLarge: boolean }> {
  const result: Array<{ lineNum: number; isLarge: boolean }> = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) {
      continue;
    }
    
    let maxLen = 0;
    for (const id of resolvedIds) {
      if (line.includes(id)) {
        maxLen = Math.max(maxLen, id.length);
      }
    }
    
    if (maxLen > 0) {
      result.push({ lineNum: i, isLarge: maxLen >= 6 });
    }
  }
  
  return result;
}

function collectLinesWithContext(
  lines: string[],
  matchedLines: Array<{ lineNum: number; isLarge: boolean }>
): string[] {
  const outputLines: string[] = [];
  let prevEnd = -1;
  
  for (const { lineNum, isLarge } of matchedLines) {
    const start = isLarge ? Math.max(0, lineNum - SNIPPET_CONTEXT_BEFORE) : lineNum;
    const end = isLarge ? Math.min(lines.length - 1, lineNum + SNIPPET_CONTEXT_AFTER) : lineNum;
    
    const actualStart = Math.max(start, prevEnd + 1);
    
    for (let i = actualStart; i <= end && outputLines.length < MAX_OUTPUT_LINES; i++) {
      outputLines.push(lines[i]);
    }
    
    prevEnd = Math.max(prevEnd, end);
    
    if (outputLines.length >= MAX_OUTPUT_LINES) break;
  }
  
  return outputLines;
}

function fallbackSnippet(symbols: CodeSymbol[], lines: string[]): string | null {
  const output: string[] = [];
  const imports = symbols.filter(s => s.type === "import").slice(0, 5);
  for (const imp of imports) {
    output.push(imp.signature);
    if (output.length >= MAX_OUTPUT_LINES) return output.join("\n");
  }
  
  const defs = symbols
    .filter(s => ["function", "class", "interface"].includes(s.type))
    .slice(0, 10);
  
  for (const d of defs) {
    if (output.length >= MAX_OUTPUT_LINES) break;
    output.push(lines[d.line]);
  }
  
  return output.length ? output.join("\n") : null;
}
