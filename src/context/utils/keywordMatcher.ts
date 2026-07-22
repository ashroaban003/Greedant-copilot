/**
 * keywordMatcher — Shared utilities for keyword matching and scoring.
 */

import { SmartKeywordResult, FILE_SCORING } from "../types";

export function scoreFilenameAgainstKeywords(
  fileName: string,
  keywords: SmartKeywordResult
): number {
  let score = 0;

  const fileNameLower = fileName.toLowerCase();
  const fileNameNoExt = fileNameLower.replace(/\.\w+$/, "");

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


