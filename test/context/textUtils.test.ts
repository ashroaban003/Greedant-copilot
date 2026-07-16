import {
  getLanguageId,
  trimCommonWhitespace,
  formatWithLineNumbers,
  getFileName,
} from "../../src/context/utils/textUtils";

// ─── Tests ───────────────────────────────────────────────────────

describe("textUtils", () => {
  describe("getLanguageId", () => {
    it("returns typescript for typescript", () => {
      expect(getLanguageId("typescript")).toBe("typescript");
    });

    it("returns tsx for typescriptreact", () => {
      expect(getLanguageId("typescriptreact")).toBe("tsx");
    });

    it("returns jsx for javascriptreact", () => {
      expect(getLanguageId("javascriptreact")).toBe("jsx");
    });

    it("returns bash for shellscript", () => {
      expect(getLanguageId("shellscript")).toBe("bash");
    });

    it("returns kotlin for kotlin", () => {
      expect(getLanguageId("kotlin")).toBe("kotlin");
    });

    it("returns text for unknown language", () => {
      expect(getLanguageId("unknown-lang")).toBe("text");
    });

    it("returns text for empty string", () => {
      expect(getLanguageId("")).toBe("text");
    });
  });

  describe("trimCommonWhitespace", () => {
    it("removes common indentation from all lines", () => {
      const input = ["    const x = 1;", "    const y = 2;"];
      const result = trimCommonWhitespace(input);
      expect(result).toEqual(["const x = 1;", "const y = 2;"]);
    });

    it("preserves relative indentation", () => {
      const input = ["    function test() {", "        return 1;", "    }"];
      const result = trimCommonWhitespace(input);
      expect(result).toEqual(["function test() {", "    return 1;", "}"]);
    });

    it("handles empty lines", () => {
      const input = ["    line 1", "", "    line 2"];
      const result = trimCommonWhitespace(input);
      expect(result).toEqual(["line 1", "", "line 2"]);
    });

    it("handles lines with only whitespace", () => {
      const input = ["    code", "   ", "    more"];
      const result = trimCommonWhitespace(input);
      expect(result).toEqual(["code", "", "more"]);
    });

    it("returns original lines when no common indent", () => {
      const input = ["no indent", "also no indent"];
      const result = trimCommonWhitespace(input);
      expect(result).toEqual(["no indent", "also no indent"]);
    });

    it("handles single line", () => {
      const input = ["  single"];
      const result = trimCommonWhitespace(input);
      expect(result).toEqual(["single"]);
    });

    it("handles empty array", () => {
      const result = trimCommonWhitespace([]);
      expect(result).toEqual([]);
    });
  });

  describe("formatWithLineNumbers", () => {
    it("adds line numbers with correct padding", () => {
      const input = ["line 1", "line 2", "line 3"];
      const result = formatWithLineNumbers(input, 1);
      expect(result).toEqual(["1 | line 1", "2 | line 2", "3 | line 3"]);
    });

    it("pads line numbers for double digits", () => {
      const input = ["a", "b"];
      const result = formatWithLineNumbers(input, 9);
      expect(result).toEqual([" 9 | a", "10 | b"]);
    });

    it("handles starting from arbitrary line", () => {
      const input = ["code"];
      const result = formatWithLineNumbers(input, 42);
      expect(result).toEqual(["42 | code"]);
    });

    it("handles empty array", () => {
      const result = formatWithLineNumbers([], 1);
      expect(result).toEqual([]);
    });

    it("handles triple digit line numbers", () => {
      const input = ["a", "b"];
      const result = formatWithLineNumbers(input, 99);
      expect(result).toEqual([" 99 | a", "100 | b"]);
    });
  });

  describe("getFileName", () => {
    it("extracts file name from unix path", () => {
      expect(getFileName("/home/user/project/file.ts")).toBe("file.ts");
    });

    it("extracts file name from windows path", () => {
      expect(getFileName("C:\\Users\\project\\file.ts")).toBe("file.ts");
    });

    it("handles file name only", () => {
      expect(getFileName("file.ts")).toBe("file.ts");
    });

    it("handles nested paths", () => {
      expect(getFileName("/a/b/c/d/e/file.ts")).toBe("file.ts");
    });

    it("handles empty string", () => {
      expect(getFileName("")).toBe("");
    });
  });
});
