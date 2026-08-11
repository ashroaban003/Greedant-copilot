import {
  shouldSkipTestFile,
  scoreFilenameAgainstKeywords,
} from "../../src/context/utils/keywordMatcher";
import { SmartKeywordResult, FILE_SCORING } from "../../src/context/types";

function createKeywords(tier1: string[], tier2: { keyword: string; score: number }[] = []): SmartKeywordResult {
  return {
    tier1: tier1.map(kw => ({ keyword: kw, score: 100 as const })),
    tier2,
  };
}

describe("keywordMatcher", () => {
  describe("shouldSkipTestFile", () => {
    it("returns false for non-test files", () => {
      const keywords = createKeywords(["UserService"]);
      expect(shouldSkipTestFile("UserService.java", keywords)).toBe(false);
      expect(shouldSkipTestFile("UserController.ts", keywords)).toBe(false);
    });

    it("returns false for test file with exact keyword match", () => {
      const keywords = createKeywords(["UserServiceTest"]);
      expect(shouldSkipTestFile("UserServiceTest.java", keywords)).toBe(false);
    });

    it("returns true for test file with only partial keyword match", () => {
      const keywords = createKeywords(["UserService"]);
      // User asked about UserService, should skip UserServiceTest
      expect(shouldSkipTestFile("UserServiceTest.java", keywords)).toBe(true);
    });

    it("detects various test file patterns", () => {
      const keywords = createKeywords(["Account"]);
      
      // Java patterns
      expect(shouldSkipTestFile("AccountTest.java", keywords)).toBe(true);
      expect(shouldSkipTestFile("AccountTests.java", keywords)).toBe(true);
      expect(shouldSkipTestFile("AccountIT.java", keywords)).toBe(true);
      
      // TypeScript/JavaScript patterns
      expect(shouldSkipTestFile("Account.test.ts", keywords)).toBe(true);
      expect(shouldSkipTestFile("Account.spec.ts", keywords)).toBe(true);
      expect(shouldSkipTestFile("Account.test.js", keywords)).toBe(true);
      
      // Python/Go patterns
      expect(shouldSkipTestFile("account_test.py", keywords)).toBe(true);
      expect(shouldSkipTestFile("account_test.go", keywords)).toBe(true);
    });

    it("is case-insensitive for matching", () => {
      const keywords = createKeywords(["userservicetest"]);
      expect(shouldSkipTestFile("UserServiceTest.java", keywords)).toBe(false);
    });
  });

  describe("scoreFilenameAgainstKeywords", () => {
    it("returns TIER1_FILENAME_EXACT for exact match", () => {
      const keywords = createKeywords(["UserService"]);
      const score = scoreFilenameAgainstKeywords("UserService.ts", keywords);
      expect(score).toBe(FILE_SCORING.TIER1_FILENAME_EXACT);
    });

    it("returns TIER1_FILENAME_CONTAINS for partial match", () => {
      const keywords = createKeywords(["User"]);
      const score = scoreFilenameAgainstKeywords("UserService.ts", keywords);
      expect(score).toBe(FILE_SCORING.TIER1_FILENAME_CONTAINS);
    });

    it("returns 0 for no match", () => {
      const keywords = createKeywords(["Payment"]);
      const score = scoreFilenameAgainstKeywords("UserService.ts", keywords);
      expect(score).toBe(0);
    });

    it("returns 0 for test file with partial match (filtered)", () => {
      const keywords = createKeywords(["UserService"]);
      const score = scoreFilenameAgainstKeywords("UserServiceTest.java", keywords);
      expect(score).toBe(0);
    });

    it("returns score for test file with exact match", () => {
      const keywords = createKeywords(["UserServiceTest"]);
      const score = scoreFilenameAgainstKeywords("UserServiceTest.java", keywords);
      expect(score).toBeGreaterThan(0);
    });

    it("bypasses test filter when bypassTestFilter is true", () => {
      const keywords = createKeywords(["UserService"]);
      const score = scoreFilenameAgainstKeywords("UserServiceTest.java", keywords, true);
      expect(score).toBeGreaterThan(0);
    });

    it("requires keyword length >= 4 for partial match", () => {
      const keywords = createKeywords(["Usr"]);
      const score = scoreFilenameAgainstKeywords("UserService.ts", keywords);
      expect(score).toBe(0);
    });

    it("is case-insensitive", () => {
      const keywords = createKeywords(["userservice"]);
      const score = scoreFilenameAgainstKeywords("UserService.ts", keywords);
      expect(score).toBe(FILE_SCORING.TIER1_FILENAME_EXACT);
    });

    it("accumulates scores for multiple matching keywords", () => {
      const keywords = createKeywords(["User", "Service"]);
      const score = scoreFilenameAgainstKeywords("UserService.ts", keywords);
      // Both "User" and "Service" match as contains
      expect(score).toBe(FILE_SCORING.TIER1_FILENAME_CONTAINS * 2);
    });
  });
});
