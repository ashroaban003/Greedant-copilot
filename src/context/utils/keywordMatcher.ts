/**
 * keywordMatcher — Shared utilities for keyword matching and scoring.
 */

import { SmartKeywordResult, FILE_SCORING } from "../types";

/** Test file patterns: *Test.java, *IT.java, *.test.ts, *.spec.ts, etc. */
const TEST_FILE_PATTERNS = [
  /test\.(?:ts|tsx|js|jsx|java|py|go|rs|rb)$/i,      // *.test.ts
  /spec\.(?:ts|tsx|js|jsx|java|py|go|rs|rb)$/i,      // *.spec.ts
  /tests?\.(?:ts|tsx|js|jsx|java|py|go|rs|rb)$/i,    // *Test.java, *Tests.java
  /it\.(?:java)$/i,                                    // *IT.java (integration tests)
  /_test\.(?:go|py)$/i,                               // *_test.go, *_test.py
];


function isTestFile(fileName: string): boolean {
  return TEST_FILE_PATTERNS.some(pattern => pattern.test(fileName));
}

function hasExactKeywordMatch(fileNameNoExt: string, keywords: SmartKeywordResult): boolean {
  const fileNameLower = fileNameNoExt.toLowerCase();
  return keywords.tier1.some(({ keyword }) => fileNameLower === keyword.toLowerCase());
}

export function shouldSkipTestFile(fileName: string, keywords: SmartKeywordResult): boolean {
  if (!isTestFile(fileName)) {
    return false;
  }
  const fileNameNoExt = fileName.replace(/\.\w+$/, "");
  return !hasExactKeywordMatch(fileNameNoExt, keywords);
}

export function scoreFilenameAgainstKeywords(
  fileName: string,
  keywords: SmartKeywordResult,
  bypassTestFilter: boolean = false
): number {
  const fileNameLower = fileName.toLowerCase();
  const fileNameNoExt = fileNameLower.replace(/\.\w+$/, "");

  const hasExact = hasExactKeywordMatch(fileNameNoExt, keywords);
  if (!bypassTestFilter && isTestFile(fileName) && !hasExact) {
    return 0;
  }

  let score = 0;

  for (const { keyword } of keywords.tier1) {
    const kwLower = keyword.toLowerCase();

    if (fileNameNoExt === kwLower) {
      score += FILE_SCORING.TIER1_FILENAME_EXACT;
    }
    else if (fileNameNoExt.includes(kwLower) && kwLower.length >= 4) {
      score += FILE_SCORING.TIER1_FILENAME_CONTAINS;
    }
  }

  return score;
}

export function scoreContentAgainstKeywords(
  content: string,
  keywords: SmartKeywordResult
): number {
  let score = 0;
  const contentLower = content.toLowerCase();

  for (const { keyword } of keywords.tier1) {
    const kwLower = keyword.toLowerCase();
    if (contentLower.includes(kwLower)) {
      score += FILE_SCORING.TIER1_CONTENT_MATCH;
    }
  }
  for (const { keyword, score: relevance } of keywords.tier2) {
    const kwLower = keyword.toLowerCase();
    if (contentLower.includes(kwLower)) {
      const boost = Math.round((relevance / 100) * 20);
      score += boost;
    }
  }

  return score;
}

export function scoreFunctionName(
  fnName: string,
  keywords: SmartKeywordResult
): number {
  let score = 0;
  const fnNameLower = fnName.toLowerCase();

  for (const { keyword } of keywords.tier1) {
    const kwLower = keyword.toLowerCase();
    if (fnNameLower === kwLower) {
      score += 100; // Exact match
    } else if (fnNameLower.includes(kwLower) || kwLower.includes(fnNameLower)) {
      score += 50; // Partial match
    }
  }
  for (const { keyword, score: relevance } of keywords.tier2) {
    const kwLower = keyword.toLowerCase();
    if (fnNameLower.includes(kwLower)) {
      score += Math.round(relevance * 0.3); // Scaled by relevance
    }
  }

  return score;
}


