/**
 * ContextRanker — Sorts and filters context items for optimal prompt assembly.
 *
 * Applies a two-level sort:
 * 1. Priority tier (Selection > ActiveFile > OpenFiles > Grep)
 * 2. Relevance score within the same tier (higher = better)
 *
 * Then greedily fills the token budget in sorted order.
 */

import { ContextItem, BuiltContext } from "./types";
import { TokenBudget } from "./TokenBudget";

/** Separator between different context sources */
const SOURCE_SEPARATOR = "\n---\n";

export class ContextRanker {
  private tokenBudget: TokenBudget;

  constructor(tokenBudget: TokenBudget) {
    this.tokenBudget = tokenBudget;
  }

  /**
   * Rank all context items and fit them into the available budget.
   * Returns the final assembled context ready for prompt injection.
   */
  rankAndFit(items: ContextItem[], availableBudget: number): BuiltContext {
    if (items.length === 0 || availableBudget <= 0) {
      return { content: "", tokensUsed: 0, includedItems: [], budgetTotal: availableBudget };
    }

    // Sort: priority ascending (lower = higher priority), then relevance descending
    const sorted = [...items].sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return b.relevanceScore - a.relevanceScore;
    });

    // Account for separators in the budget (roughly)
    const separatorOverhead = Math.min(items.length - 1, 5) * 5; // ~5 tokens per separator
    const effectiveBudget = Math.max(0, availableBudget - separatorOverhead);

    // Greedy fill
    const { fitted, tokensUsed } = this.tokenBudget.fitItems(sorted, effectiveBudget);

    // Assemble final content with section separators
    const content = this.assembleContent(fitted);

    return {
      content,
      tokensUsed: tokensUsed + separatorOverhead,
      includedItems: fitted,
      budgetTotal: availableBudget,
    };
  }

  /**
   * Assemble context items into a single prompt-ready string.
   * Groups items by source for readability.
   */
  private assembleContent(items: ContextItem[]): string {
    if (items.length === 0) {
      return "";
    }

    // Group consecutive items by source to avoid excessive separators
    const parts: string[] = [];
    let currentGroup: string[] = [];
    let lastSource = items[0].source;

    for (const item of items) {
      if (item.source !== lastSource) {
        // Flush current group
        if (currentGroup.length > 0) {
          parts.push(currentGroup.join("\n\n"));
        }
        currentGroup = [item.content];
        lastSource = item.source;
      } else {
        currentGroup.push(item.content);
      }
    }

    // Flush final group
    if (currentGroup.length > 0) {
      parts.push(currentGroup.join("\n\n"));
    }

    return parts.join(SOURCE_SEPARATOR);
  }
}
