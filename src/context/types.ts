/**
 * Shared types for the context management system.
 */

/** Priority levels for context items (lower number = higher priority) */
export enum ContextPriority {
  /** Current editor selection — always included first */
  Selection = 1,
  /** Active file structure (imports, signatures) */
  ActiveFile = 2,
  /** Related open files in editor tabs */
  OpenFiles = 3,
  /** Workspace grep search results */
  GrepSearch = 4,
}

/** A single piece of context to potentially include in the prompt */
export interface ContextItem {
  /** Source provider identifier */
  source: string;
  /** Priority level */
  priority: ContextPriority;
  /** Relevance score within the same priority (higher = more relevant) */
  relevanceScore: number;
  /** The formatted content to inject into the prompt */
  content: string;
  /** Estimated token count for this item */
  tokenCount: number;
  /** File path this context came from (if applicable) */
  filePath?: string;
  /** Brief label for debugging/logging */
  label: string;
}

/** Budget allocation for each provider tier */
export interface BudgetAllocation {
  /** Max tokens for selection context */
  selection: number;
  /** Max tokens for active file context */
  activeFile: number;
  /** Max tokens for open files context */
  openFiles: number;
  /** Max tokens for grep search context */
  grepSearch: number;
  /** Total available for all context */
  total: number;
}

/** Result of context building — ready to inject into prompt */
export interface BuiltContext {
  /** Combined context string */
  content: string;
  /** Total tokens used */
  tokensUsed: number;
  /** Items that were included */
  includedItems: ContextItem[];
  /** Available budget that was provided */
  budgetTotal: number;
}
