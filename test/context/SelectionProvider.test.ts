import { SelectionProvider } from "../../src/context/providers/SelectionProvider";
import { setMockActiveTextEditor, createMockEditor } from "../__mocks__/vscode";

// ─── Tests ───────────────────────────────────────────────────────

describe("SelectionProvider", () => {
  let provider: SelectionProvider;

  beforeEach(() => {
    provider = new SelectionProvider();
    setMockActiveTextEditor(null);
  });

  afterEach(() => {
    setMockActiveTextEditor(null);
  });

  describe("getContext", () => {
    it("returns null when no editor is active", () => {
      setMockActiveTextEditor(null);

      const result = provider.getContext();

      expect(result).toBeNull();
    });

    it("returns formatted context with file name", () => {
      setMockActiveTextEditor(
        createMockEditor({
          fileName: "/project/src/utils.ts",
          lines: ["const x = 1;"],
          cursorLine: 0,
        })
      );

      const result = provider.getContext();

      expect(result).toContain("File: utils.ts");
    });

    it("includes language identifier in code block", () => {
      setMockActiveTextEditor(
        createMockEditor({
          languageId: "typescript",
          lines: ["const x = 1;"],
          cursorLine: 0,
        })
      );

      const result = provider.getContext();

      expect(result).toContain("```typescript");
    });

    it("shows line number for cursor position when no selection", () => {
      setMockActiveTextEditor(
        createMockEditor({
          lines: ["line 1", "line 2", "line 3"],
          cursorLine: 1,
        })
      );

      const result = provider.getContext();

      expect(result).toContain("(line 2)");
    });

    it("shows line range for selection", () => {
      setMockActiveTextEditor(
        createMockEditor({
          lines: ["line 1", "line 2", "line 3", "line 4", "line 5"],
          selectionStart: { line: 1, character: 0 },
          selectionEnd: { line: 3, character: 0 },
          cursorLine: 1,
        })
      );

      const result = provider.getContext();

      expect(result).toContain("(lines 2-4)");
    });

    it("includes surrounding lines with line numbers", () => {
      setMockActiveTextEditor(
        createMockEditor({
          lines: [
            "function test() {",
            "  const a = 1;",
            "  const b = 2;",
            "  return a + b;",
            "}",
          ],
          cursorLine: 2,
        })
      );

      const result = provider.getContext();

      expect(result).toContain("1 |");
      expect(result).toContain("function test()");
    });

    it("respects file boundaries when getting surrounding lines", () => {
      // Cursor at line 0 - can't get lines before it
      setMockActiveTextEditor(
        createMockEditor({
          lines: ["first line", "second line"],
          cursorLine: 0,
        })
      );

      const result = provider.getContext();

      // Should include available lines without error
      expect(result).toContain("first line");
      expect(result).toContain("second line");
    });

    it("includes header explaining the context", () => {
      setMockActiveTextEditor(
        createMockEditor({
          lines: ["const x = 1;"],
          cursorLine: 0,
        })
      );

      const result = provider.getContext();

      expect(result).toContain("# Selected Code");
      expect(result).toContain("This is the code the user currently has selected");
    });

    it("handles different language IDs", () => {
      setMockActiveTextEditor(
        createMockEditor({
          languageId: "python",
          lines: ["def test():"],
          cursorLine: 0,
        })
      );

      const result = provider.getContext();

      expect(result).toContain("```python");
    });
  });
});
