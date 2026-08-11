/**
 * KeywordExtractor — Extracts search-relevant keywords from user messages.
 */

const STOP_WORDS = new Set([
  // English
  "the", "are", "was", "were",  "been", "being", "for",  "with",  "from", 
  "have", "has", "had","doing","dont", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "need", "dare", "ought",
  "into", "through", "during", "before", "after", "above", "below",
  "between", "out","dint", "off", "over", "under", "again", "further", "then",
  "once", "here", "there", "when", "where", "why", "how", "all", "each",
  "every", "both", "few", "more", "most", "other", "some", "such", 
  "not", "only", "own", "same",  "than", "too", "very", "just",
  "because", "but", "and", "while", "about","down","tried",
  "that", "this", "these", "those", "what", "which", "who", "whom",
  "it", "its", "our", "you", "your",  "essentially", "generally",
  "him", "his", "she", "her", "they", "them", "their","understand ",
  "probably", "maybe", "perhaps", "sure", "certainly", "definitely",
  "actually", "literally", "obviously","technicaly", "technically",
  "necessary","weird", "strange", "odd", "funny", "interesting", "curious", "peculiar",
  "short", "long", "big", "small", "large", "tiny", "huge", "massive",
  "breif", "quick", "slow", "fast", "rapid", "sudden", "gradual","isnt", "wasnt", "werent", "arent", "havent", "hasnt", "hadnt",
  "concise", "clear", "vague", "ambiguous", "obscure", "complex", "simple",

  
  //Emotional words
  "shit", "fuck", "damn", "hell", "crap", "sucks", "suck", "stupid", "dumb",
  "idiot", "moron", "asshole", "bastard", "bitch", "jerk", "loser","wtf","bullshit",

  // Code-related noise
  "function", "class", "const", "let", "var", "return", "import",
  "export", "default", "new", "void", "null", "undefined", "true",
  "false", "type", "interface", "enum", "async", "await", "try",
  "catch", "throw", "extends", "implements", "public", "private",
  "protected", "static", "readonly", "get","getting", "set","setting", "constructor", "super", "this", "self", "prototype",
  // Common request words
  "please", "help", "want", "make", "create", "add", "fix", "change","changing",
  "update", "modify", "write", "show", "explain", "tell", "give","delete",
  "code", "file", "line", "error", "bug", "issue", "problem","remove",
  "work", "work?","works?","works", "working", "use", "using", "used",
  "think", "check", "see", "look", "find", "need", "know","modifying",
  "call", "called", "calling", "run", "running", "test", "testing",
  "like", "something", "thing", "stuff", "way", "ways",
  "also", "actually", "basically", "currently", "really",
  "example", "sample", "demo", "implement", "implementation",
  "exactly", "still"
]);

const MIN_WORD_LENGTH = 3;
const MAX_PRIMARY = 5;
const MAX_DERIVED = 8;

export interface ExtractedKeywords {
  primary: string[];
  derived: string[];
}

/**
 * Extract keywords separating primary identifiers from derived (camelCase/snake_case) parts.
 */
export function extractKeywordsStructured(message: string): ExtractedKeywords {
  if (!message || message.trim().length === 0) {
    return { primary: [], derived: [] };
  }

  const fullIdentifiers: string[] = [];
  const partialWords = new Set<string>();

  // Quoted strings — highest priority
  const quotedMatches = message.match(/["'`]([^"'`]+)["'`]/g);
  if (quotedMatches) {
    for (const quoted of quotedMatches) {
      const inner = quoted.slice(1, -1).trim();
      if (inner.length >= MIN_WORD_LENGTH) {
        fullIdentifiers.push(inner);
      }
    }
  }

  // Hyphenated terms
  const hyphenatedMatches = message.match(/[a-zA-Z][a-zA-Z0-9]*(?:-[a-zA-Z0-9]+)+/g) || [];
  for (const term of hyphenatedMatches) {
    if (term.length >= MIN_WORD_LENGTH && !STOP_WORDS.has(term.toLowerCase())) {
      fullIdentifiers.push(term);
    }
  }

  // Identifiers
  const identifiers = message.match(/[a-zA-Z_$][a-zA-Z0-9_$]*/g) || [];
  for (const id of identifiers) {
    if (hyphenatedMatches.some(h => h.includes(id))) { continue; }
    
    if (id.length >= MIN_WORD_LENGTH && !STOP_WORDS.has(id.toLowerCase())) {
      fullIdentifiers.push(id);
    }

    // camelCase splits
    const camelParts = id.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Z])([A-Z][a-z])/g, "$1 $2").split(/\s+/);
    if (camelParts.length > 1) {
      for (const part of camelParts) {
        if (part.length >= MIN_WORD_LENGTH && !STOP_WORDS.has(part.toLowerCase())) {
          partialWords.add(part);
        }
      }
    }

    // snake_case splits
    const snakeParts = id.split("_");
    if (snakeParts.length > 1) {
      for (const part of snakeParts) {
        if (part.length >= MIN_WORD_LENGTH && !STOP_WORDS.has(part.toLowerCase())) {
          partialWords.add(part);
        }
      }
    }
  }

  // Dedupe primary
  const seen = new Set<string>();
  const uniquePrimary: string[] = [];
  for (const id of fullIdentifiers) {
    const lower = id.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      uniquePrimary.push(id);
    }
  }

  // Derived: exclude those already in primary
  const uniqueDerived = [...partialWords]
    .filter(p => !seen.has(p.toLowerCase()))
    .sort((a, b) => b.length - a.length);

  uniquePrimary.sort((a, b) => b.length - a.length);

  return {
    primary: uniquePrimary.slice(0, MAX_PRIMARY),
    derived: uniqueDerived.slice(0, MAX_DERIVED),
  };
}

export function extractPrimaryTerm(message: string): string | null {
  const { primary } = extractKeywordsStructured(message);
  return primary.length > 0 ? primary[0] : null;
}
