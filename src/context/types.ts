import { CodeSymbol } from "./ASTLite";

export enum ContextPriority {
  Selection = 1,
  ActiveFile = 2,
  OpenFiles = 3,
  GrepSearch = 4,
}

export interface ContextItem {
  source: string;
  priority: ContextPriority;
  relevanceScore: number;
  content: string;
  tokenCount: number;
  filePath?: string;
  label: string;
}

export interface BudgetAllocation {
  selection: number;
  activeFile: number;
  openFiles: number;
  grepSearch: number;
  total: number;
}

export interface BuiltContext {
  content: string;
  tokensUsed: number;
  includedItems: ContextItem[];
  budgetTotal: number;
}

export interface Tier1Keyword {
  keyword: string;
  score: 100;
}

export interface Tier2Keyword {
  keyword: string;
  score: number;
}

export interface SmartKeywordResult {
  tier1: Tier1Keyword[];
  tier2: Tier2Keyword[];
}

export type FileCandidateSource = "active" | "open" | "grep";

export interface FunctionContext {
  filePath: string;
  fileName: string;
  functionName: string;
  content: string;
  startLine: number;
  score: number;
}

export interface FileSkeleton {
  filePath: string;
  fileName: string;
  skeleton: string;
  languageId: string;
}

export interface FileExtractionResult {
  skeleton: FileSkeleton;
  functions: FunctionContext[];
  symbols: CodeSymbol[];
}


export interface FileCandidate {
  filePath: string;
  score: number;
  source: FileCandidateSource;
  matchLines?: number[];
}


export interface MergedFileCandidate {
  filePath: string;
  score: number;
  sources: FileCandidateSource[];
  matchLines?: number[];
}

export const FILE_SCORING = {
  TIER1_FILENAME_EXACT: 1600,
  TIER1_FILENAME_CONTAINS: 100,
  TIER1_CONTENT_MATCH: 30,
  ACTIVE_FILE: 69,
  OPEN_FILES: 13,
  OTHER_FILES: 0,
  IMPORT_RELATIONSHIP: 10,
  SAME_LANGUAGE: 5,
} as const;
