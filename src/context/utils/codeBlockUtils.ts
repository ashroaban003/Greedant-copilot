/**
 * codeBlockUtils — Shared utilities for code block detection and extraction.
 */

/** File extensions to exclude from search/context */
const EXCLUDED_EXTENSIONS = [".json", ".lock", ".map", ".min.js", ".min.css"];

/** Glob patterns to exclude from workspace search */
export const EXCLUDE_GLOB_PATTERNS = [
  "**/node_modules/**",
  "**/dist/**",
  "**/out/**",
  "**/.git/**",
  "**/package-lock.json",
  "**/*.min.*",
  "**/coverage/**",
];

/**
 * Check if a file should be excluded from context gathering.
 * @param fileName - File name (not full path)
 */
export function shouldExcludeFile(fileName: string): boolean {
  const nameLower = fileName.toLowerCase();
  return EXCLUDED_EXTENSIONS.some(ext => nameLower.endsWith(ext));
}

/**
 * Extract import paths from file content.
 * Matches `import ... from '...'` and `from '...'` patterns.
 */
export function extractImportPaths(content: string): string[] {
  const imports: string[] = [];
  const importRegex = /(?:import|from)\s+['"]([^'"]+)['"]/g;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }
  return imports;
}

/**
 * Find the end of a code block using brace counting.
 * Works for C-style languages (JS, TS, Java, Go, etc.)
 */
export function findBlockEnd(lines: string[], startLine: number, maxLines = 50): number {
  let braceCount = 0;
  let foundOpen = false;

  const endLimit = Math.min(startLine + maxLines, lines.length);

  for (let i = startLine; i < endLimit; i++) {
    const line = lines[i];
    for (const ch of line) {
      if (ch === "{") {
        braceCount++;
        foundOpen = true;
      } else if (ch === "}") {
        braceCount--;
        if (foundOpen && braceCount === 0) {
          return i;
        }
      }
    }
  }

  // Fallback: if no brace matching found
  return Math.min(startLine + 20, lines.length - 1);
}
