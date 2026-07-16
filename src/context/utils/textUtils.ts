/**
 * Text utilities for context processing.
 * Reusable across different context providers.
 */

/**
 * Language ID mapping for code block formatting.
 */
const LANGUAGE_MAP: Record<string, string> = {
  typescript: 'typescript',
  typescriptreact: 'tsx',
  javascript: 'javascript',
  javascriptreact: 'jsx',
  python: 'python',
  java: 'java',
  kotlin: 'kotlin',
  csharp: 'csharp',
  cpp: 'cpp',
  c: 'c',
  go: 'go',
  rust: 'rust',
  ruby: 'ruby',
  php: 'php',
  html: 'html',
  css: 'css',
  json: 'json',
  yaml: 'yaml',
  markdown: 'markdown',
  sql: 'sql',
  shellscript: 'bash',
  plaintext: 'text',
};

/**
 * Get markdown language identifier from VS Code language ID.
 */
export function getLanguageId(vscodeLangId: string): string {
  return LANGUAGE_MAP[vscodeLangId] || 'text';
}

/**
 * Trim common leading whitespace from all lines (dedent).
 */
export function trimCommonWhitespace(lines: string[]): string[] {
  let minIndent = Infinity;
  
  for (const line of lines) {
    if (line.trim().length === 0) continue;
    const match = line.match(/^(\s*)/);
    if (match) {
      minIndent = Math.min(minIndent, match[1].length);
    }
  }

  if (minIndent === Infinity || minIndent === 0) {
    return lines;
  }

  return lines.map(line => {
    if (line.trim().length === 0) return '';
    return line.slice(minIndent);
  });
}

/**
 * Format lines with line numbers prefixed.
 */
export function formatWithLineNumbers(lines: string[], startLine: number): string[] {
  const maxLineNum = startLine + lines.length - 1;
  const padding = String(maxLineNum).length;

  return lines.map((line, index) => {
    const lineNum = String(startLine + index).padStart(padding, ' ');
    return `${lineNum} | ${line}`;
  });
}

/**
 * Extract file name from full path.
 */
export function getFileName(filePath: string): string {
  return filePath.split(/[/\\]/).pop() || filePath;
}
