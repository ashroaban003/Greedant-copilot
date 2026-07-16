import { ContextManager } from "../../src/context/ContextManager";
import { SelectionProvider } from "../../src/context/providers/SelectionProvider";

// ─── Helpers ─────────────────────────────────────────────────────

function createMockSelectionProvider(context: string | null = null): SelectionProvider {
  return {
    getContext: jest.fn(() => context),
  } as unknown as SelectionProvider;
}

// ─── Tests ───────────────────────────────────────────────────────

describe("ContextManager", () => {
  describe("getSelectionContext", () => {
    it("returns context from SelectionProvider", () => {
      const mockProvider = createMockSelectionProvider("# Selected Code\nconst x = 1;");
      const manager = new ContextManager(mockProvider);

      const result = manager.getSelectionContext();

      expect(result).toBe("# Selected Code\nconst x = 1;");
      expect(mockProvider.getContext).toHaveBeenCalled();
    });

    it("returns null when SelectionProvider returns null", () => {
      const mockProvider = createMockSelectionProvider(null);
      const manager = new ContextManager(mockProvider);

      const result = manager.getSelectionContext();

      expect(result).toBeNull();
    });
  });

  describe("buildPromptWithContext", () => {
    it("appends instructions to base prompt", () => {
      const mockProvider = createMockSelectionProvider(null);
      const manager = new ContextManager(mockProvider);

      const result = manager.buildPromptWithContext("You are a helpful assistant.");

      expect(result).toContain("You are a helpful assistant.");
      expect(result).toContain("## Instructions");
    });

    it("includes selection context when available", () => {
      const mockProvider = createMockSelectionProvider("# Selected Code\nfunction test() {}");
      const manager = new ContextManager(mockProvider);

      const result = manager.buildPromptWithContext("Base prompt.");

      expect(result).toContain("Base prompt.");
      expect(result).toContain("## Instructions");
      expect(result).toContain("# Selected Code");
      expect(result).toContain("function test() {}");
    });

    it("does not include selection section when context is null", () => {
      const mockProvider = createMockSelectionProvider(null);
      const manager = new ContextManager(mockProvider);

      const result = manager.buildPromptWithContext("Base prompt.");

      expect(result).toContain("Base prompt.");
      expect(result).toContain("## Instructions");
      expect(result).not.toContain("# Selected Code");
    });

    it("includes instruction about not repeating code", () => {
      const mockProvider = createMockSelectionProvider(null);
      const manager = new ContextManager(mockProvider);

      const result = manager.buildPromptWithContext("Test.");

      expect(result).toContain("Dont repeat selected code back to user");
    });

    it("includes instruction about context relevance", () => {
      const mockProvider = createMockSelectionProvider(null);
      const manager = new ContextManager(mockProvider);

      const result = manager.buildPromptWithContext("Test.");

      expect(result).toContain("context is insufficient");
    });

    it("maintains correct prompt structure order", () => {
      const mockProvider = createMockSelectionProvider("# Selected Code\ncode here");
      const manager = new ContextManager(mockProvider);

      const result = manager.buildPromptWithContext("Base prompt.");

      // Verify order: base prompt -> instructions -> separator -> context
      const baseIndex = result.indexOf("Base prompt.");
      const instructionsIndex = result.indexOf("## Instructions");
      const separatorIndex = result.indexOf("---");
      const contextIndex = result.indexOf("# Selected Code");

      expect(baseIndex).toBeLessThan(instructionsIndex);
      expect(instructionsIndex).toBeLessThan(separatorIndex);
      expect(separatorIndex).toBeLessThan(contextIndex);
    });
  });
});
