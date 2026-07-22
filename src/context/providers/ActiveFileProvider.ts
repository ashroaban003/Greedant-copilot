/**
 * ActiveFileProvider — Discovers the currently active file.
 */

import {
  FileCandidate,
  FILE_SCORING,
} from "../types";
import {
  getActiveFilePath,
  getActiveFileContent,
} from "../utils/fileDiscoveryUtils";

export class ActiveFileProvider {
  constructor() {}

  /**
   * Get file candidate for the active editor file.
   * Returns null if no editor is open or the file is empty.
   */
  getFileCandidate(): FileCandidate | null {
    const filePath = getActiveFilePath();
    if (!filePath) {
      return null;
    }

    // Check if file has content
    const content = getActiveFileContent();
    if (!content || !content.trim()) {
      return null;
    }

    return {
      filePath,
      score: FILE_SCORING.ACTIVE_FILE,
      source: "active",
    };
  }
}
