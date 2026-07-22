/**
 * TokenBudget — Dynamic token budget calculator.
 *
 * Determines how many tokens are available for context injection
 * based on the model's context window size. Adapts automatically
 * to 2K, 4K, 8K, or larger context windows.
 */

import { BudgetAllocation } from "./types";

const CHARS_PER_TOKEN = 3.4;

const RESPONSE_RESERVE_PERCENT = 0.25;
const MIN_RESPONSE_RESERVE = 500;
const MAX_RESPONSE_RESERVE = 4000;

/** Fixed token reserve for base system prompt instructions */
const SYSTEM_PROMPT_RESERVE = 170;

const BUDGET_SHARES = {
  selection: 0.35,
  activeFile: 0.30,
  openFiles: 0.20,
  grepSearch: 0.15,
};

export class TokenBudget {
  private contextWindowSize: number;

  constructor(contextWindowSize: number = 4096) {
    this.contextWindowSize = contextWindowSize;
  }

  setContextWindow(size: number): void {
    this.contextWindowSize = size;
  }

  //TODO: Contextwindow should be defined in folder like properties

  get contextWindow(): number {
    return this.contextWindowSize;
  }

  estimateTokens(text: string): number {
    if (!text) { return 0; }
    return Math.ceil(text.length / CHARS_PER_TOKEN);
  }

  calculateAvailableBudget(
    systemPromptTokens: number,
    userMessageTokens: number
  ): number {
    const responseReserve = this.calculateResponseReserve();
    const fixedCost = systemPromptTokens + userMessageTokens + responseReserve + SYSTEM_PROMPT_RESERVE;
    const available = this.contextWindowSize - fixedCost;

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
   * Calculate tokens reserved for model response.
   */
  private calculateResponseReserve(): number {
    const calculated = Math.floor(this.contextWindowSize * RESPONSE_RESERVE_PERCENT);
    // Clamp: ensure value stays within [MIN_RESPONSE_RESERVE, MAX_RESPONSE_RESERVE]
    if (calculated < MIN_RESPONSE_RESERVE) { return MIN_RESPONSE_RESERVE; }
    if (calculated > MAX_RESPONSE_RESERVE) { return MAX_RESPONSE_RESERVE; }
    return calculated;
  }
}
