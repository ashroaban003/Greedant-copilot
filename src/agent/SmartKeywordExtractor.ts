/**
 * SmartKeywordExtractor — AI-powered keyword extraction with semantic understanding.
 */

import { LLMProvider } from "../llm/LLMProvider";
import { LLMMessage } from "../llm/LLMTypes";
import { extractKeywords } from "../context/utils/keywordExtractor";
import { findRelevantContent } from "../context/utils/functionExtractor";
import { SmartKeywordResult, Tier1Keyword, Tier2Keyword } from "../context/types";
export { SmartKeywordResult, Tier1Keyword, Tier2Keyword };

interface LLMKeywordResponse {
  list1: string[];
  list2: Tier2Keyword[];
}

const MAX_TIER1_KEYWORDS = 7;
const MAX_TIER2_KEYWORDS = 9;
const DEFAULT_RETRY_ATTEMPTS = 2;
const LLM_TIMEOUT_MS = 10000;

const EXTRACTION_SYSTEM_PROMPT = `You are a code analysis assistant. Extract keywords from user queries for code search.

Input:
A user query. Relevant code snippets from the active file.
Task:
Return two keyword lists that will be used to search and rank code.

list1: File-level identifiers = Includes Classes ,Interfaces ,Types ,Important variables or services
Rules:
Prefer exact identifiers from the snippets and query. max 6 
Correct query typos only when a clear snippet match exists. Do not invent identifiers.

list2: Function-level keywords =Includes Functions and methods , Properties ,elevant domain terms ,Useful parts of compound identifiers
Scores:
81-90: Exact or essential function match
70-80: Strongly related
50-69: Useful supporting term
Rules:
Prefer keywords found in snippets. No list1 items or duplicates.
Maximum 9 . Sort by score descending. Avoid using generic words like "function", "method", "variable", "class".

Example :
user query: "How to handle AccauntIdProcesor and customerReferrence errors in payment module?"
Relevant code snippets:
class AccountIdProcessor {
  processPayment(accountId: string) { 
     const accouninfo = this.accountservice.getAccountInfo(accountId);
  }
  handleError(error: Error) { ... }
}
EXPECTED OUTPUT FORMAT (strict JSON):
{
  "list1": ["AccountIdProcessor", "customerReference", "AccountService"],
  "list2": [
    {"keyword": "getAccountInfo", "score": 90},
    {"keyword": "accountInfo", "score": 65},
    {"keyword": "paymentModule", "score": 80}
  ]
}`;

export class SmartKeywordExtractor {
  private provider: LLMProvider;

  constructor(provider: LLMProvider) {
    this.provider = provider;
  }

  async extract(
    userMessage: string,
    activeFileContent: string | null,
    languageId: string,
    selectionText: string | null = null,
    previousAssistantResponse: string | null = null
  ): Promise<SmartKeywordResult> {
    const initialKeywords = extractKeywords(userMessage, false);

    if (initialKeywords.length === 0 && !selectionText) {
      return this.fallbackExtraction(userMessage);
    }

    const relevantContent = findRelevantContent(activeFileContent, languageId, initialKeywords);
    const userPrompt = this.buildUserPrompt(userMessage, initialKeywords, relevantContent, selectionText, previousAssistantResponse);
    console.log(userPrompt)
    
    const result = await this.callLLMWithRetry(userPrompt);

    if (result) {
      const processed = this.processLLMResponse(result);
      if (processed.tier1.length > 0) {
        console.log(processed.tier1)
        return processed;
      }
    }

    return this.fallbackExtraction(userMessage);
  }

  /**
   * Call LLM with retry logic and timeout protection.
   */
  private async callLLMWithRetry(userPrompt: string): Promise<LLMKeywordResponse | null> {
    for (let attempt = 0; attempt <= DEFAULT_RETRY_ATTEMPTS; attempt++) {
      try {
        const messages: LLMMessage[] = [
          { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ];

        const response = await this.callWithTimeout(messages);
        const parsed = this.extractJson(response);

        if (parsed && this.validateResponse(parsed)) {
          return parsed;
        }
      } catch {
        // Continue to next retry
      }
    }
    return null;
  }

  private async callWithTimeout(messages: LLMMessage[]): Promise<string> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("LLM request timed out")), LLM_TIMEOUT_MS);
    });

    const requestPromise = this.provider.chat({
      messages,
      temperature: 0.1,
    }).then(res => res.content);

    return Promise.race([requestPromise, timeoutPromise]);
  }

  private extractJson(content: string): unknown | null {
    if (!content) { return null; }

    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      try { return JSON.parse(codeBlockMatch[1].trim()); } catch { /* fall through */ }
    }

    const jsonMatch = content.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) {
      try { return JSON.parse(jsonMatch[1]); } catch { /* fall through */ }
    }

    try { return JSON.parse(content.trim()); } catch { return null; }
  }

  private validateResponse(data: unknown): data is LLMKeywordResponse {
    if (!data || typeof data !== "object") { return false; }

    const obj = data as Record<string, unknown>;

    if (!Array.isArray(obj.list1)) { return false; }
    if (!obj.list1.every((item) => typeof item === "string")) { return false; }

    if (!Array.isArray(obj.list2)) { return false; }
    for (const item of obj.list2) {
      if (!item || typeof item !== "object") { return false; }
      const entry = item as Record<string, unknown>;
      if (typeof entry.keyword !== "string") { return false; }
      if (typeof entry.score !== "number") { return false; }
    }

    return true;
  }

  private buildUserPrompt(
    userMessage: string,
    initialKeywords: string[],
    relevantContent: string | null,
    selectionText: string | null = null,
    previousAssistantResponse: string | null = null
  ): string {
    let prompt = `USER QUERY: ${userMessage}\n\n`;
    prompt += `INITIAL BASIC KEYWORDS : ${initialKeywords.join(", ")}\n\n`;

    if (previousAssistantResponse) {
      prompt += `PREVIOUS ASSISTANT RESPONSE (for context):\n${previousAssistantResponse}\n\n`;
    }

    if (selectionText) {
      prompt += `SELECTED CODE (This maybe related):\n\`\`\`\n${selectionText}\n\`\`\`\n\n`;
    }

    if (relevantContent) {
      prompt += `RELEVANT CODE SNIPPETS FROM ACTIVE FILE:\n\`\`\`\n${relevantContent}\n\`\`\`\n\n`;
    } else if (!selectionText) {
      prompt += "RELEVANT CODE SNIPPETS: (none found)\n\n";
    }

    prompt += "Correct any typos, expand with semantic keywords, and return JSON only.";
    return prompt;
  }

  private processLLMResponse(response: LLMKeywordResponse): SmartKeywordResult {
    const tier1: Tier1Keyword[] = response.list1
      .filter((kw) => kw && kw.length >= 2)
      .slice(0, MAX_TIER1_KEYWORDS)
      .map((keyword) => ({ keyword, score: 100 as const }));

    const tier2: Tier2Keyword[] = response.list2
      .filter((item) => item.keyword && item.keyword.length >= 2)
      .slice(0, MAX_TIER2_KEYWORDS)
      .map((item) => ({
        keyword: item.keyword,
        score: Math.max(0, Math.min(100, Math.round(item.score))),
      }))
      .sort((a, b) => b.score - a.score);

    return { tier1, tier2 };
  }

  private fallbackExtraction(userMessage: string): SmartKeywordResult {
    const basicKeywords = extractKeywords(userMessage);

    const tier1: Tier1Keyword[] = basicKeywords
      .slice(0, MAX_TIER1_KEYWORDS)
      .map((keyword) => ({ keyword, score: 100 as const }));

    const tier2: Tier2Keyword[] = basicKeywords
      .slice(MAX_TIER1_KEYWORDS)
      .map((keyword, index) => ({
        keyword,
        score: Math.max(50, 80 - index * 10),
      }));

    return { tier1, tier2 };
  }
}
