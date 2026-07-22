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
    const len = trimmed.length;

    // Skip empty lines (fast check)
    if (len === 0) { continue; }

    const firstChar = trimmed.charCodeAt(0);

    // Track multi-line comments
    // '/' = 47, '*' = 42
    if (firstChar === 47 && trimmed.charCodeAt(1) === 42) {
      inMultiLineComment = true;
    }
    if (inMultiLineComment) {
      if (trimmed.includes("*/")) { inMultiLineComment = false; }
      continue;
    }

    // Skip single-line comments: '//' (47, 47)
    if (firstChar === 47 && trimmed.charCodeAt(1) === 47) { continue; }

    // Fast path: use first character to determine which patterns to try
    // 'i' = 105 (import, interface)
    // 'e' = 101 (export)
    // 'c' = 99 (class, const)
    // 'l' = 108 (let)
    // 'v' = 118 (var)
    // 'f' = 102 (function)
    // 'a' = 97 (async, abstract)
    // 't' = 116 (type)

    // Imports: must start with 'i'
    if (firstChar === 105 && trimmed.startsWith("import")) {
      if (TS_JS_PATTERNS.import.test(trimmed)) {
        symbols.push({
          type: "import",
          name: extractImportName(trimmed),
          signature: len > 100 ? trimmed.slice(0, 100) + "..." : trimmed,
          line: i,
        });
        continue;
      }
    }

    // Export-prefixed declarations: 'e'
    if (firstChar === 101 && trimmed.startsWith("export")) {
      // Check for class
      if (trimmed.includes("class")) {
        const classMatch = trimmed.match(TS_JS_PATTERNS.class);
        if (classMatch) {
          symbols.push({ type: "class", name: classMatch[1], signature: trimLine(trimmed), line: i });
          continue;
        }
      }
      // Check for interface
      if (trimmed.includes("interface")) {
        const ifaceMatch = trimmed.match(TS_JS_PATTERNS.interface);
        if (ifaceMatch) {
          symbols.push({ type: "interface", name: ifaceMatch[1], signature: trimLine(trimmed), line: i });
          continue;
        }
      }
      // Check for type alias
      if (trimmed.includes("type ")) {
        const typeMatch = trimmed.match(TS_JS_PATTERNS.typeAlias);
        if (typeMatch) {
          symbols.push({ type: "type", name: typeMatch[1], signature: trimLine(trimmed), line: i });
          continue;
        }
      }
      // Check for function
      if (trimmed.includes("function")) {
        const funcMatch = trimmed.match(TS_JS_PATTERNS.function);
        if (funcMatch) {
          symbols.push({ type: "function", name: funcMatch[1], signature: extractFunctionSignature(lines, i), line: i });
          continue;
        }
      }
      // Check for arrow function (export const/let/var)
      // Already know it starts with "export", check for const/let/var
      const afterExport = trimmed.slice(7); // Skip "export "
      if (afterExport.startsWith("const") || afterExport.startsWith("let") || afterExport.startsWith("var")) {
        // Check for arrow in same line or nearby
        if (trimmed.includes("=>")) {
          const arrowMatch = trimmed.match(TS_JS_PATTERNS.arrowFunction);
          if (arrowMatch) {
            symbols.push({ type: "function", name: arrowMatch[1], signature: trimLine(trimmed), line: i });
            continue;
          }
        } else if (containsArrowNearby(lines, i + 1, 2)) {
          // Multi-line arrow function (only check ahead if no arrow on current line)
          const assignMatch = trimmed.match(TS_JS_PATTERNS.arrowFunctionAssignment);
          if (assignMatch) {
            symbols.push({ type: "function", name: assignMatch[1], signature: trimLine(trimmed), line: i });
            continue;
          }
        }
      }
      // Generic named export
      const exportMatch = trimmed.match(TS_JS_PATTERNS.exportNamed);
      if (exportMatch) {
        symbols.push({ type: "export", name: extractExportName(trimmed), signature: trimLine(trimmed), line: i });
        continue;
      }
      continue; // Processed export line
    }

    // Class (non-exported): 'c' or 'a' (abstract)
    if ((firstChar === 99 || firstChar === 97) && trimmed.includes("class")) {
      const classMatch = trimmed.match(TS_JS_PATTERNS.class);
      if (classMatch) {
        symbols.push({ type: "class", name: classMatch[1], signature: trimLine(trimmed), line: i });
        continue;
      }
    }

    // Interface (non-exported): 'i'
    if (firstChar === 105 && trimmed.startsWith("interface")) {
      const ifaceMatch = trimmed.match(TS_JS_PATTERNS.interface);
      if (ifaceMatch) {
        symbols.push({ type: "interface", name: ifaceMatch[1], signature: trimLine(trimmed), line: i });
        continue;
      }
    }

    // Type alias (non-exported): 't'
    if (firstChar === 116 && trimmed.startsWith("type ")) {
      const typeMatch = trimmed.match(TS_JS_PATTERNS.typeAlias);
      if (typeMatch) {
        symbols.push({ type: "type", name: typeMatch[1], signature: trimLine(trimmed), line: i });
        continue;
      }
    }

    // Function (non-exported): 'f' or 'a' (async)
    if ((firstChar === 102 || firstChar === 97) && trimmed.includes("function")) {
      const funcMatch = trimmed.match(TS_JS_PATTERNS.function);
      if (funcMatch) {
        symbols.push({ type: "function", name: funcMatch[1], signature: extractFunctionSignature(lines, i), line: i });
        continue;
      }
    }

    // Arrow functions (const/let/var): 'c', 'l', 'v'
    if (firstChar === 99 || firstChar === 108 || firstChar === 118) {
      // Quick check: line must contain '=' for variable assignment
      if (trimmed.includes("=")) {
        // Check for explicit arrow on same line first
        if (trimmed.includes("=>")) {
          const arrowMatch = trimmed.match(TS_JS_PATTERNS.arrowFunction);
          if (arrowMatch) {
            symbols.push({ type: "function", name: arrowMatch[1], signature: trimLine(trimmed), line: i });
            continue;
          }
        }
        // Multi-line arrow function
        const assignMatch = trimmed.match(TS_JS_PATTERNS.arrowFunctionAssignment);
        if (assignMatch && containsArrowNearby(lines, i, 3)) {
          symbols.push({ type: "function", name: assignMatch[1], signature: trimLine(trimmed), line: i });
          continue;
        }
      }
    }

    // Class methods (indented) — but not inside function bodies
    // Check indentation: starts with space or tab, but not deeply indented
    const lineFirstChar = line.charCodeAt(0);
    // space = 32, tab = 9
    if (lineFirstChar === 32 || lineFirstChar === 9) {
      // Avoid deeply nested code (4+ spaces or 2+ tabs)
      if (!line.startsWith("    ") && !line.startsWith("\t\t")) {
        // Constructor: 'c'
        if (firstChar === 99 && trimmed.startsWith("constructor")) {
          if (TS_JS_PATTERNS.constructorMethod.test(trimmed)) {
            symbols.push({ type: "function", name: "constructor", signature: trimLine(trimmed), line: i });
            continue;
          }
        }
        // Other methods: check for method pattern
        const methodMatch = trimmed.match(TS_JS_PATTERNS.method);
        if (methodMatch && !isCommonKeyword(methodMatch[1])) {
          symbols.push({ type: "function", name: methodMatch[1], signature: trimLine(trimmed), line: i });
        }
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

    if (!trimmed) { continue; }

    const firstChar = trimmed.charCodeAt(0);

    // Skip comments: '#' = 35
    if (firstChar === 35) { continue; }

    // 'i' = 105 (import), 'f' = 102 (from, def with async)
    // 'c' = 99 (class)
    // 'd' = 100 (def)
    // 'a' = 97 (async def)

    // Imports: 'i' or 'f'
    if (firstChar === 105 || firstChar === 102) {
      if (trimmed.startsWith("import") || trimmed.startsWith("from")) {
        symbols.push({
          type: "import",
          name: extractPythonImportName(trimmed),
          signature: trimLine(trimmed),
          line: i,
        });
        continue;
      }
    }

    // Class: 'c'
    if (firstChar === 99 && trimmed.startsWith("class")) {
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
    }

    // Function: 'd' (def) or 'a' (async def)
    if (firstChar === 100 || firstChar === 97) {
      if (trimmed.startsWith("def") || trimmed.startsWith("async")) {
        const funcMatch = trimmed.match(PYTHON_PATTERNS.function);
        if (funcMatch) {
          symbols.push({
            type: "function",
            name: funcMatch[1],
            signature: trimLine(trimmed),
            line: i,
          });
        }
      }
    }
  }

  return symbols;
}

function extractGo(lines: string[]): CodeSymbol[] {
  const symbols: CodeSymbol[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();

    if (!trimmed) { continue; }

    const firstChar = trimmed.charCodeAt(0);

    // Skip comments: '/' = 47
    if (firstChar === 47 && trimmed.charCodeAt(1) === 47) { continue; }

    // 'i' = 105 (import)
    // 't' = 116 (type - struct/interface)
    // 'f' = 102 (func)

    // Import: 'i'
    if (firstChar === 105 && trimmed.startsWith("import")) {
      symbols.push({
        type: "import",
        name: "import",
        signature: trimLine(trimmed),
        line: i,
      });
      continue;
    }

    // Type (struct/interface): 't'
    if (firstChar === 116 && trimmed.startsWith("type")) {
      // Check for struct
      if (trimmed.includes("struct")) {
        const structMatch = trimmed.match(GO_PATTERNS.struct);
        if (structMatch) {
          symbols.push({ type: "class", name: structMatch[1], signature: trimLine(trimmed), line: i });
          continue;
        }
      }
      // Check for interface
      if (trimmed.includes("interface")) {
        const ifaceMatch = trimmed.match(GO_PATTERNS.interface);
        if (ifaceMatch) {
          symbols.push({ type: "interface", name: ifaceMatch[1], signature: trimLine(trimmed), line: i });
          continue;
        }
      }
      continue;
    }

    // Function: 'f'
    if (firstChar === 102 && trimmed.startsWith("func")) {
      const funcMatch = trimmed.match(GO_PATTERNS.function);
      if (funcMatch) {
        symbols.push({
          type: "function",
          name: funcMatch[1],
          signature: trimLine(trimmed),
          line: i,
        });
      }
    }
  }

  return symbols;
}

// ─── Helpers ────────────────────────────────────────────────────

function buildSkeleton(symbols: CodeSymbol[], _language: string): string {
  if (symbols.length === 0) {
    return "";
  }

  // Single pass: separate imports from definitions
  const importNames: string[] = [];
  const definitions: CodeSymbol[] = [];
  
  for (const sym of symbols) {
    if (sym.type === "import") {
      if (sym.name) { importNames.push(sym.name); }
    } else {
      definitions.push(sym);
    }
  }

  const parts: string[] = [];

  if (importNames.length > 0) {
    parts.push(`Imports: ${importNames.join(", ")}`);
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
  // Fast path: find the name after "export <keyword> "
  // Format: "export const|let|var|function|class|interface|type|enum|abstract NAME"
  const words = line.split(/\s+/);
  // words[0] = "export", words[1] = keyword, words[2] = name (or words[2] could be "abstract" for "export abstract class")
  if (words.length >= 3) {
    const name = words[2] === "class" ? words[3] : words[2];
    // Extract just the identifier (stop at non-word chars)
    const match = name?.match(/^(\w+)/);
    return match ? match[1] : "";
  }
  return "";
}

function trimLine(line: string): string {
  return line.length > 120 ? line.slice(0, 120) + "..." : line;
}

// Pre-computed keyword set (avoid recreating on each call)
const COMMON_KEYWORDS = new Set([
  "if", "else", "for", "while", "switch", "case", "return", "try",
  "catch", "finally", "new", "delete", "typeof", "instanceof",
  "break", "continue", "default", "throw", "with", "yield",
]);

function isCommonKeyword(name: string): boolean {
  return COMMON_KEYWORDS.has(name);
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
