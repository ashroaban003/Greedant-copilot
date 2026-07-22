/**
 * KeywordExtractor — Extracts search-relevant keywords from user messages.
 */

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
  "work", "works", "working", "use", "using", "used",
  "think", "check", "see", "look", "find", "need", "know",
  "call", "called", "calling", "run", "running", "test", "testing",
  "like", "something", "thing", "stuff", "way", "ways",
  "also", "actually", "basically", "currently", "really",
  "example", "sample", "demo", "implement", "implementation",
]);

const MIN_WORD_LENGTH = 3;
const MAX_KEYWORDS = 8;

export function extractKeywords(message: string, includePartialKeywords: boolean = true): string[] {
  if (!message || message.trim().length === 0) {
    return [];
  }

  const fullIdentifiers: string[] = [];
  const partialWords = new Set<string>();

  // Extract quoted strings (user likely means these literally) — highest priority
  const quotedMatches = message.match(/["'`]([^"'`]+)["'`]/g);
  if (quotedMatches) {
    for (const quoted of quotedMatches) {
      const inner = quoted.slice(1, -1).trim();
      if (inner.length >= MIN_WORD_LENGTH) {
        fullIdentifiers.push(inner);
      }
    }
  }
  const hyphenatedMatches = message.match(/[a-zA-Z][a-zA-Z0-9]*(?:-[a-zA-Z0-9]+)+/g) || [];
  for (const term of hyphenatedMatches) {
    if (term.length >= MIN_WORD_LENGTH && !STOP_WORDS.has(term.toLowerCase())) {
      fullIdentifiers.push(term);
    }
  }
  const identifiers = message.match(/[a-zA-Z_$][a-zA-Z0-9_$]*/g) || [];

  for (const id of identifiers) {
    if (hyphenatedMatches.some(h => h.includes(id))) {
      continue;
    }
    if (id.length >= MIN_WORD_LENGTH && !STOP_WORDS.has(id.toLowerCase())) {
      fullIdentifiers.push(id);
    }

    if (includePartialKeywords) {
      // Split camelCase: "getUserName" → ["get", "User", "Name"]
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
  }
  const seen = new Set<string>();
  const uniqueIdentifiers: string[] = [];
  for (const id of fullIdentifiers) {
    const lower = id.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      uniqueIdentifiers.push(id);
    }
  }

  uniqueIdentifiers.sort((a, b) => b.length - a.length);
  if (includePartialKeywords) {
    const partials = [...partialWords].filter(p => !seen.has(p.toLowerCase()));
    partials.sort((a, b) => b.length - a.length);
    return [...uniqueIdentifiers, ...partials].slice(0, MAX_KEYWORDS);
  }

  return uniqueIdentifiers.slice(0, MAX_KEYWORDS);
}

export function extractPrimaryTerm(message: string): string | null {
  const keywords = extractKeywords(message);
  if (keywords.length === 0) { return null; }
  return keywords[0];
}

function splitCamelCase(str: string): string[] {
  return str
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
    .split(/\s+/)
    .filter((s) => s.length > 0);
}
