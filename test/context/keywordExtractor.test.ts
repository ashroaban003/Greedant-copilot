import { extractKeywordsStructured, extractPrimaryTerm } from "../../src/context/utils/keywordExtractor";

describe("keywordExtractor", () => {
  describe("extractKeywordsStructured", () => {
    it("returns empty arrays for empty message", () => {
      const result = extractKeywordsStructured("");
      expect(result.primary).toEqual([]);
      expect(result.derived).toEqual([]);
    });

    it("extracts full identifier as primary", () => {
      const result = extractKeywordsStructured("explain accountResourceTest");
      expect(result.primary).toContain("accountResourceTest");
    });

    it("puts camelCase splits in derived, not primary", () => {
      const result = extractKeywordsStructured("how getUserName works");
      
      // Full identifier in primary
      expect(result.primary).toContain("getUserName");
      
      // camelCase parts in derived (excluding stop words like "get")
      expect(result.derived).toContain("User");
      expect(result.derived).toContain("Name");
      
      // Parts should NOT be in primary
      expect(result.primary).not.toContain("User");
      expect(result.primary).not.toContain("Name");
    });

    it("extracts quoted strings as primary with highest priority", () => {
      const result = extractKeywordsStructured('find "UserService" in code');
      expect(result.primary[0]).toBe("UserService");
    });

    it("extracts hyphenated terms as primary", () => {
      const result = extractKeywordsStructured("update my-component styles");
      expect(result.primary).toContain("my-component");
    });

    it("filters stop words", () => {
      const result = extractKeywordsStructured("how does the function work");
      expect(result.primary).not.toContain("how");
      expect(result.primary).not.toContain("does");
      expect(result.primary).not.toContain("the");
      expect(result.primary).not.toContain("function");
      expect(result.primary).not.toContain("work");
    });

    it("sorts by length descending (longer = more specific)", () => {
      const result = extractKeywordsStructured("UserController api User");
      expect(result.primary[0]).toBe("UserController");
    });

    it("deduplicates case-insensitively", () => {
      const result = extractKeywordsStructured("UserService userservice USERSERVICE");
      const primaryLower = result.primary.map(k => k.toLowerCase());
      const uniqueCount = new Set(primaryLower).size;
      expect(uniqueCount).toBe(result.primary.length);
    });

    it("limits primary keywords to MAX_PRIMARY (5)", () => {
      const result = extractKeywordsStructured(
        "ClassOne ClassTwo ClassThree ClassFour ClassFive ClassSix ClassSeven"
      );
      expect(result.primary.length).toBeLessThanOrEqual(5);
    });

    it("limits derived keywords to MAX_DERIVED (8)", () => {
      // Create a message with many camelCase parts
      const result = extractKeywordsStructured(
        "onePartTwoPart threePart fourPart fivePart sixPart sevenPart eightPart ninePart tenPart"
      );
      expect(result.derived.length).toBeLessThanOrEqual(8);
    });

    it("handles snake_case splits as derived", () => {
      const result = extractKeywordsStructured("update user_account_service");
      expect(result.primary).toContain("user_account_service");
      expect(result.derived).toContain("user");
      expect(result.derived).toContain("account");
      expect(result.derived).toContain("service");
    });

    it("excludes derived parts that match primary", () => {
      const result = extractKeywordsStructured("UserService User");
      // "User" is in primary as standalone, so shouldn't be in derived
      expect(result.derived).not.toContain("User");
    });
  });

  describe("extractPrimaryTerm", () => {
    it("returns null for empty message", () => {
      expect(extractPrimaryTerm("")).toBeNull();
    });

    it("returns first primary keyword", () => {
      const term = extractPrimaryTerm("explain ChatService behavior");
      expect(term).toBe("ChatService");
    });

    it("returns longest identifier as primary term", () => {
      const term = extractPrimaryTerm("User UserController");
      expect(term).toBe("UserController");
    });
  });
});
