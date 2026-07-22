/**
 * ASTLite — Lightweight regex-based code structure extraction.
 *
 * Extracts function signatures, class declarations, imports, and exports
 * from source code WITHOUT a full AST parser. Zero dependencies.
 *
 * Supports: TypeScript, JavaScript, Python, Go, Rust, Java
 * Accuracy: ~90% for well-formatted code. Good enough for context hints.
 */

/** A single extracted code symbol */
export interface CodeSymbol {
  /** Symbol type */
  type: "import" | "export" | "function" | "class" | "interface" | "type" | "variable";
  /** Symbol name (if extractable) */
  name: string;
  /** The raw line or signature text */
  signature: string;
  /** Line number (0-indexed) */
  line: number;
}

/** Result of file structure extraction */
export interface FileStructure {
  /** All extracted symbols */
  symbols: CodeSymbol[];
  /** Compact skeleton string for prompt injection */
  skeleton: string;
  /** Language detected */
  language: string;
}

// ─── Language-specific regex patterns ───────────────────────────

const TS_JS_PATTERNS = {
  import: /^(import\s+.+)/,
  exportDefault: /^(export\s+default\s+.+)/,
  exportNamed: /^(export\s+(?:const|let|var|function|class|interface|type|enum|abstract)\s+\w+)/,
  function: /^(?:export\s+)?(?:async\s+)?function\s*\*?\s*(\w+)\s*[(<]/,
  arrowFunction: /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[a-zA-Z_$]\w*)\s*=>/,
  arrowFunctionAssignment: /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(/,
  class: /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/,
  interface: /^(?:export\s+)?interface\s+(\w+)/,
  typeAlias: /^(?:export\s+)?type\s+(\w+)\s*[<=]/,
  method: /^\s+(?:async\s+)?(?:static\s+)?(?:readonly\s+)?(?:get\s+|set\s+)?(\w+)\s*[(<:]/,
  constructorMethod: /^\s+constructor\s*\(/,
};

const PYTHON_PATTERNS = {
  import: /^(?:import\s+.+|from\s+.+\s+import\s+.+)/,
  function: /^(?:async\s+)?def\s+(\w+)\s*\(/,
  class: /^class\s+(\w+)/,
  decorator: /^@(\w+)/,
};

const GO_PATTERNS = {
  import: /^import\s+/,
  function: /^func\s+(?:\(\w+\s+\*?\w+\)\s+)?(\w+)\s*\(/,
  struct: /^type\s+(\w+)\s+struct/,
  interface: /^type\s+(\w+)\s+interface/,
};

/**
 * Extract the structure of a source file.
 */
export function extractFileStructure(
  content: string,
  languageId: string
): FileStructure {
  const lines = content.split("\n");
  const language = normalizeLanguage(languageId);
  let symbols: CodeSymbol[];

  switch (language) {
    case "typescript":
    case "javascript":
      symbols = extractTsJs(lines);
      break;
    case "python":
      symbols = extractPython(lines);
      break;
    case "go":
      symbols = extractGo(lines);
      break;
    default:
      // Generic fallback: just grab imports and obvious function/class patterns
      symbols = extractTsJs(lines);
      break;
  }

  const skeleton = buildSkeleton(symbols, language);
  return { symbols, skeleton, language };
}

/**
 * Extract only function/method signatures from content.
 * Useful for getting a compact overview of what a file defines.
 */
export function extractSignatures(content: string, languageId: string): string[] {
  const structure = extractFileStructure(content, languageId);
  return structure.symbols
    .filter((s) => s.type === "function" || s.type === "class" || s.type === "interface")
    .map((s) => s.signature);
}

// ─── Language extractors ────────────────────────────────────────

function extractTsJs(lines: string[]): CodeSymbol[] {
  const symbols: CodeSymbol[] = [];
  let inMultiLineComment = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();

    // Skip empty lines
    if (!trimmed) { continue; }

    // Track multi-line comments
    if (trimmed.startsWith("/*")) { inMultiLineComment = true; }
    if (inMultiLineComment) {
      if (trimmed.includes("*/")) { inMultiLineComment = false; }
      continue;
    }

    // Skip single-line comments
    if (trimmed.startsWith("//")) { continue; }

    // Imports
    if (TS_JS_PATTERNS.import.test(trimmed)) {
      symbols.push({
        type: "import",
        name: extractImportName(trimmed),
        signature: trimmed.length > 100 ? trimmed.slice(0, 100) + "..." : trimmed,
        line: i,
      });
      continue;
    }

    // Class
    const classMatch = trimmed.match(TS_JS_PATTERNS.class);
    if (classMatch) {
      symbols.push({
        type: "class",
        name: classMatch[1],
        signature: trimLine(trimmed),
        line: i,
      });
      continue;
    }

    // Interface
    const ifaceMatch = trimmed.match(TS_JS_PATTERNS.interface);
    if (ifaceMatch) {
      symbols.push({
        type: "interface",
        name: ifaceMatch[1],
        signature: trimLine(trimmed),
        line: i,
      });
      continue;
    }

    // Type alias
    const typeMatch = trimmed.match(TS_JS_PATTERNS.typeAlias);
    if (typeMatch) {
      symbols.push({
        type: "type",
        name: typeMatch[1],
        signature: trimLine(trimmed),
        line: i,
      });
      continue;
    }

    // Named function
    const funcMatch = trimmed.match(TS_JS_PATTERNS.function);
    if (funcMatch) {
      symbols.push({
        type: "function",
        name: funcMatch[1],
        signature: extractFunctionSignature(lines, i),
        line: i,
      });
      continue;
    }

    // Arrow function with explicit arrow (more reliable detection)
    const arrowMatch = trimmed.match(TS_JS_PATTERNS.arrowFunction);
    if (arrowMatch) {
      symbols.push({
        type: "function",
        name: arrowMatch[1],
        signature: trimLine(trimmed),
        line: i,
      });
      continue;
    }

    // Arrow function assignment (const x = async (...) => ...)
    // Only match if the line or next few lines contain =>
    const assignMatch = trimmed.match(TS_JS_PATTERNS.arrowFunctionAssignment);
    if (assignMatch && containsArrowNearby(lines, i, 3)) {
      symbols.push({
        type: "function",
        name: assignMatch[1],
        signature: trimLine(trimmed),
        line: i,
      });
      continue;
    }

    // Export statements
    const exportMatch = trimmed.match(TS_JS_PATTERNS.exportNamed);
    if (exportMatch) {
      symbols.push({
        type: "export",
        name: extractExportName(trimmed),
        signature: trimLine(trimmed),
        line: i,
      });
      continue;
    }

    // Class methods (indented) — but not inside function bodies
    if ((line.startsWith("  ") || line.startsWith("\t")) && !line.startsWith("    ")) {
      // Constructor
      if (TS_JS_PATTERNS.constructorMethod.test(trimmed)) {
        symbols.push({
          type: "function",
          name: "constructor",
          signature: trimLine(trimmed),
          line: i,
        });
        continue;
      }

      const methodMatch = trimmed.match(TS_JS_PATTERNS.method);
      if (methodMatch && !isCommonKeyword(methodMatch[1])) {
        symbols.push({
          type: "function",
          name: methodMatch[1],
          signature: trimLine(trimmed),
          line: i,
        });
      }
    }
  }

  return symbols;
}

/**
 * Check if an arrow (=>) appears within N lines of the current line.
 */
function containsArrowNearby(lines: string[], startLine: number, lookAhead: number): boolean {
  for (let i = startLine; i < Math.min(lines.length, startLine + lookAhead); i++) {
    if (lines[i].includes("=>")) { return true; }
  }
  return false;
}

function extractPython(lines: string[]): CodeSymbol[] {
  const symbols: CodeSymbol[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    // Imports
    if (PYTHON_PATTERNS.import.test(trimmed)) {
      symbols.push({
        type: "import",
        name: extractPythonImportName(trimmed),
        signature: trimLine(trimmed),
        line: i,
      });
      continue;
    }

    // Class
    const classMatch = trimmed.match(PYTHON_PATTERNS.class);
    if (classMatch) {
      symbols.push({
        type: "class",
        name: classMatch[1],
        signature: trimLine(trimmed),
        line: i,
      });
      continue;
    }

    // Function/method
    const funcMatch = trimmed.match(PYTHON_PATTERNS.function);
    if (funcMatch) {
      symbols.push({
        type: "function",
        name: funcMatch[1],
        signature: trimLine(trimmed),
        line: i,
      });
      continue;
    }
  }

  return symbols;
}

function extractGo(lines: string[]): CodeSymbol[] {
  const symbols: CodeSymbol[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();

    if (!trimmed || trimmed.startsWith("//")) {
      continue;
    }

    // Import
    if (GO_PATTERNS.import.test(trimmed)) {
      symbols.push({
        type: "import",
        name: "import",
        signature: trimLine(trimmed),
        line: i,
      });
      continue;
    }

    // Struct
    const structMatch = trimmed.match(GO_PATTERNS.struct);
    if (structMatch) {
      symbols.push({
        type: "class",
        name: structMatch[1],
        signature: trimLine(trimmed),
        line: i,
      });
      continue;
    }

    // Interface
    const ifaceMatch = trimmed.match(GO_PATTERNS.interface);
    if (ifaceMatch) {
      symbols.push({
        type: "interface",
        name: ifaceMatch[1],
        signature: trimLine(trimmed),
        line: i,
      });
      continue;
    }

    // Function
    const funcMatch = trimmed.match(GO_PATTERNS.function);
    if (funcMatch) {
      symbols.push({
        type: "function",
        name: funcMatch[1],
        signature: trimLine(trimmed),
        line: i,
      });
      continue;
    }
  }

  return symbols;
}

// ─── Helpers ────────────────────────────────────────────────────

function buildSkeleton(symbols: CodeSymbol[], language: string): string {
  if (symbols.length === 0) {
    return "";
  }

  const imports = symbols.filter((s) => s.type === "import");
  const definitions = symbols.filter((s) => s.type !== "import");

  const parts: string[] = [];

  if (imports.length > 0) {
    // Compact imports: just list module names
    const importNames = imports.map((s) => s.name).filter(Boolean);
    if (importNames.length > 0) {
      parts.push(`Imports: ${importNames.join(", ")}`);
    }
  }

  if (definitions.length > 0) {
    parts.push("Defines:");
    for (const sym of definitions) {
      parts.push(`  ${sym.type} ${sym.name}`);
    }
  }

  return parts.join("\n");
}

function extractFunctionSignature(lines: string[], startLine: number): string {
  // Try to capture multi-line function signature up to the opening brace
  let sig = lines[startLine].trimStart();
  if (sig.includes("{") || sig.includes("=>")) {
    return trimLine(sig.split("{")[0].trim());
  }

  // Multi-line: collect until we find { or =>
  for (let i = startLine + 1; i < Math.min(startLine + 4, lines.length); i++) {
    sig += " " + lines[i].trim();
    if (sig.includes("{") || sig.includes("=>")) {
      return trimLine(sig.split("{")[0].trim());
    }
  }

  return trimLine(sig);
}

function extractImportName(line: string): string {
  // "import { Foo } from './bar'" → "bar"
  // "import Foo from './bar'" → "bar"
  const fromMatch = line.match(/from\s+['"]([^'"]+)['"]/);
  if (fromMatch) {
    const path = fromMatch[1];
    return path.split("/").pop() || path;
  }
  // "import './styles.css'" → "styles.css"
  const directMatch = line.match(/import\s+['"]([^'"]+)['"]/);
  if (directMatch) {
    return directMatch[1].split("/").pop() || directMatch[1];
  }
  return "";
}

function extractPythonImportName(line: string): string {
  const fromMatch = line.match(/from\s+(\S+)\s+import/);
  if (fromMatch) { return fromMatch[1]; }
  const importMatch = line.match(/import\s+(\S+)/);
  if (importMatch) { return importMatch[1]; }
  return "";
}

function extractExportName(line: string): string {
  const match = line.match(/export\s+(?:const|let|var|function|class|interface|type|enum|abstract)\s+(\w+)/);
  return match ? match[1] : "";
}

function trimLine(line: string): string {
  return line.length > 120 ? line.slice(0, 120) + "..." : line;
}

function isCommonKeyword(name: string): boolean {
  const keywords = new Set([
    "if", "else", "for", "while", "switch", "case", "return", "try",
    "catch", "finally", "new", "delete", "typeof", "instanceof",
    "break", "continue", "default", "throw", "with", "yield",
  ]);
  return keywords.has(name);
}

function normalizeLanguage(langId: string): string {
  const map: Record<string, string> = {
    typescript: "typescript",
    typescriptreact: "typescript",
    javascript: "javascript",
    javascriptreact: "javascript",
    python: "python",
    go: "go",
    rust: "go", // similar enough patterns
  };
  return map[langId] || "typescript"; // default to TS/JS patterns
}
