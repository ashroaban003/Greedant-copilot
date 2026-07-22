/**
 * KeywordExtractor — Extracts search-relevant keywords from user messages.
 *
 * Used to drive grep search and file relevance scoring.
 * Splits identifiers (camelCase, snake_case), removes stop words,
 * and returns meaningful search terms.
 */

/** Common English stop words + code noise words to filter out */
const STOP_WORDS = new Set([
  // English
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "need", "dare", "ought",
  "to", "of", "in", "for", "on", "with", "at", "by", "from", "as",
  "into", "through", "during", "before", "after", "above", "below",
  "between", "out", "off", "over", "under", "again", "further", "then",
  "once", "here", "there", "when", "where", "why", "how", "all", "each",
  "every", "both", "few", "more", "most", "other", "some", "such", "no",
  "not", "only", "own", "same", "so", "than", "too", "very", "just",
  "because", "but", "and", "or", "if", "while", "about", "up", "down",
  "that", "this", "these", "those", "what", "which", "who", "whom",
  "it", "its", "i", "me", "my", "we", "our", "you", "your", "he",
  "him", "his", "she", "her", "they", "them", "their",
  // Code-related noise
  "function", "class", "const", "let", "var", "return", "import",
  "export", "default", "new", "void", "null", "undefined", "true",
  "false", "type", "interface", "enum", "async", "await", "try",
  "catch", "throw", "extends", "implements", "public", "private",
  "protected", "static", "readonly", "get", "set",
  // Common request words
  "please", "help", "want", "make", "create", "add", "fix", "change",
  "update", "modify", "write", "show", "explain", "tell", "give",
  "code", "file", "line", "error", "bug", "issue", "problem",
]);

/** Minimum word length to consider */
const MIN_WORD_LENGTH = 3;

/** Maximum keywords to return */
const MAX_KEYWORDS = 8;

/**
 * Extract meaningful keywords from a user message.
 * Returns terms useful for grep search and relevance scoring.
 * 
 * IMPORTANT: Full identifiers are prioritized over their split parts.
 * "AccountDetailsResource" should come before "Account", "Details", "Resource".
 */
export function extractKeywords(message: string): string[] {
  if (!message || message.trim().length === 0) {
    return [];
  }

  const fullIdentifiers: string[] = [];
  const partialWords = new Set<string>();

  // 1. Extract quoted strings (user likely means these literally) — highest priority
  const quotedMatches = message.match(/["'`]([^"'`]+)["'`]/g);
  if (quotedMatches) {
    for (const quoted of quotedMatches) {
      const inner = quoted.slice(1, -1).trim();
      if (inner.length >= MIN_WORD_LENGTH) {
        fullIdentifiers.push(inner);
      }
    }
  }

  // 2. Extract hyphenated terms (like "create-migrate-block") as whole units
  const hyphenatedMatches = message.match(/[a-zA-Z][a-zA-Z0-9]*(?:-[a-zA-Z0-9]+)+/g) || [];
  for (const term of hyphenatedMatches) {
    if (term.length >= MIN_WORD_LENGTH && !STOP_WORDS.has(term.toLowerCase())) {
      fullIdentifiers.push(term);
    }
  }

  // 3. Extract identifiers: words that look like code symbols
  const identifiers = message.match(/[a-zA-Z_$][a-zA-Z0-9_$]*/g) || [];

  for (const id of identifiers) {
    // Skip if this is part of a hyphenated term we already captured
    if (hyphenatedMatches.some(h => h.includes(id))) {
      continue;
    }

    // Add the full identifier FIRST (before splitting)
    if (id.length >= MIN_WORD_LENGTH && !STOP_WORDS.has(id.toLowerCase())) {
      fullIdentifiers.push(id);
    }

    // Split camelCase: "getUserName" → ["get", "User", "Name"]
    // These go into partialWords (lower priority)
    const camelParts = splitCamelCase(id);
    if (camelParts.length > 1) {
      for (const part of camelParts) {
        if (part.length >= MIN_WORD_LENGTH && !STOP_WORDS.has(part.toLowerCase())) {
          partialWords.add(part);
        }
      }
    }

    // Split snake_case: "get_user_name" → ["get", "user", "name"]
    const snakeParts = id.split("_");
    if (snakeParts.length > 1) {
      for (const part of snakeParts) {
        if (part.length >= MIN_WORD_LENGTH && !STOP_WORDS.has(part.toLowerCase())) {
          partialWords.add(part);
        }
      }
    }
  }

  // Dedupe full identifiers, preserving order (first occurrence wins)
  const seen = new Set<string>();
  const uniqueIdentifiers: string[] = [];
  for (const id of fullIdentifiers) {
    const lower = id.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      uniqueIdentifiers.push(id);
    }
  }

  // Sort full identifiers by length (longer = more specific = better)
  uniqueIdentifiers.sort((a, b) => b.length - a.length);

  // Add partial words at the end (they're less specific)
  const partials = [...partialWords].filter(p => !seen.has(p.toLowerCase()));
  partials.sort((a, b) => b.length - a.length);

  // Return: full identifiers first, then partials
  return [...uniqueIdentifiers, ...partials].slice(0, MAX_KEYWORDS);
}

/**
 * Extract the primary search term from a user message.
 * This is the single most important keyword for grep search.
 */
export function extractPrimaryTerm(message: string): string | null {
  const keywords = extractKeywords(message);
  if (keywords.length === 0) { return null; }

  // Prefer quoted terms, then longest keyword
  return keywords[0];
}

/**
 * Split a camelCase or PascalCase identifier into parts.
 */
function splitCamelCase(str: string): string[] {
  return str
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
    .split(/\s+/)
    .filter((s) => s.length > 0);
}
