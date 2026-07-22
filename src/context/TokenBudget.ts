/**
 * TokenBudget — Dynamic token budget calculator.
 *
 * Determines how many tokens are available for context injection
 * based on the model's context window size. Adapts automatically
 * to 2K, 4K, 8K, or larger context windows.
 */

import { BudgetAllocation } from "./types";

/** Percentage of total context window reserved for LLM response */
const RESPONSE_RESERVE_PERCENT = 0.25;

/** Minimum tokens to reserve for response regardless of window size */
const MIN_RESPONSE_RESERVE = 500;

/** Maximum tokens to reserve for response (cap for large windows) */
const MAX_RESPONSE_RESERVE = 4000;

/** Budget share per provider tier (must sum to 1.0) */
const BUDGET_SHARES = {
  selection: 0.35,   // Reduced — selection is often small
  activeFile: 0.30,  // Increased — file structure is very useful
  openFiles: 0.20,
  grepSearch: 0.15,
};

export class TokenBudget {
  private contextWindowSize: number;

  constructor(contextWindowSize: number = 4096) {
    this.contextWindowSize = contextWindowSize;
  }

  /**
   * Update the context window size (e.g., after querying the model).
   */
  setContextWindow(size: number): void {
    this.contextWindowSize = size;
  }

  get contextWindow(): number {
    return this.contextWindowSize;
  }

  /**
   * Estimate token count from a string.
   * Uses chars/3.5 approximation — good enough for code content.
   * Slightly more accurate for code which tends to have shorter tokens.
   */
  estimateTokens(text: string): number {
    if (!text) { return 0; }
    // Code typically has ~3.2 chars/token, but 3.5 gives safety margin
    return Math.ceil(text.length / 3.5);
  }

  /**
   * Calculate available budget for context given the fixed costs.
   * Returns 0 if there's no room for context.
   */
  calculateAvailableBudget(
    systemPromptTokens: number,
    userMessageTokens: number
  ): number {
    const responseReserve = this.calculateResponseReserve();
    const fixedCost = systemPromptTokens + userMessageTokens + responseReserve;
    const available = this.contextWindowSize - fixedCost;

    // Return 0 instead of negative, with a minimum threshold
    return available > 50 ? Math.floor(available) : 0;
  }

  /**
   * Allocate budget across provider tiers proportionally.
   */
  allocate(totalBudget: number): BudgetAllocation {
    return {
      selection: Math.floor(totalBudget * BUDGET_SHARES.selection),
      activeFile: Math.floor(totalBudget * BUDGET_SHARES.activeFile),
      openFiles: Math.floor(totalBudget * BUDGET_SHARES.openFiles),
      grepSearch: Math.floor(totalBudget * BUDGET_SHARES.grepSearch),
      total: totalBudget,
    };
  }

  /**
   * Greedy fit: fill items into budget in order until exhausted.
   * Items should already be sorted by priority/relevance.
   * 
   * Optimized to avoid unnecessary object spread for non-truncated items.
   */
  fitItems<T extends { tokenCount: number; content: string }>(
    items: T[],
    budget: number
  ): { fitted: T[]; tokensUsed: number } {
    const fitted: T[] = [];
    let tokensUsed = 0;

    for (const item of items) {
      const remaining = budget - tokensUsed;

      // Item fits completely
      if (item.tokenCount <= remaining) {
        fitted.push(item);
        tokensUsed += item.tokenCount;
        continue;
      }

      // Item doesn't fit — try truncation if there's meaningful space
      if (remaining > 80) {
        const truncatedChars = Math.floor(remaining * 3.5) - 20; // Leave room for truncation marker
        if (truncatedChars > 50) {
          const truncated = {
            ...item,
            content: item.content.slice(0, truncatedChars) + "\n...(truncated)",
            tokenCount: remaining,
          };
          fitted.push(truncated);
          tokensUsed += remaining;
        }
      }
      break; // No more room
    }

    return { fitted, tokensUsed };
  }

  /**
   * Calculate tokens reserved for model response.
   */
  private calculateResponseReserve(): number {
    const calculated = Math.floor(this.contextWindowSize * RESPONSE_RESERVE_PERCENT);
    return Math.min(MAX_RESPONSE_RESERVE, Math.max(MIN_RESPONSE_RESERVE, calculated));
  }
}
