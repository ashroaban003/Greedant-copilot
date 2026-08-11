/**
 * ActiveFileProvider — Discovers the currently active file.
 */

import {
  FileCandidate,
  SmartKeywordResult,
  FILE_SCORING,
} from "../types";
import {
  getActiveFilePath,
  getActiveFileContent,
} from "../utils/fileDiscoveryUtils";
import { getFileName } from "../utils/textUtils";
import { scoreFilenameAgainstKeywords } from "../utils/keywordMatcher";

export class ActiveFileProvider {
  constructor() {}

  getFileCandidate(keywords?: SmartKeywordResult): FileCandidate | null {
    const filePath = getActiveFilePath();
    if (!filePath) {
      return null;
    }

    // Check if file has content
    const content = getActiveFileContent();
    if (!content || !content.trim()) {
      return null;
    }


    let score = FILE_SCORING.ACTIVE_FILE;


    if (keywords) {
      const fileName = getFileName(filePath);
      score += scoreFilenameAgainstKeywords(fileName, keywords);
    }

    return {
      filePath,
      score,
      source: "active",
    };
  }
}
