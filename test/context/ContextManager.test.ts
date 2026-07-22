import { ContextManager, ContextManagerDeps } from "../../src/context/ContextManager";
import { SelectionProvider } from "../../src/context/providers/SelectionProvider";
import { TokenBudget } from "../../src/context/TokenBudget";

// ─── Helpers ─────────────────────────────────────────────────────

function createMockDeps(selectionContext: string | null = null): ContextManagerDeps {
  const mockSelectionProvider = {
    getContext: jest.fn(() => selectionContext),
  } as unknown as SelectionProvider;

  return {
    tokenBudget: new TokenBudget(),
    selectionProvider: mockSelectionProvider,
    activeFileProvider: { getFileCandidate: jest.fn(() => null) } as any,
    openFilesProvider: { getFileCandidates: jest.fn(() => []) } as any,
    grepProvider: { getFileCandidates: jest.fn(async () => []) } as any,
  };
}

// ─── Tests ───────────────────────────────────────────────────────

describe("ContextManager", () => {
  describe("buildPromptWithDefaultContext", () => {
    it("appends instructions to base prompt", () => {
      const deps = createMockDeps(null);
      const manager = new ContextManager(deps);

      const result = manager.buildPromptWithDefaultContext("You are a helpful assistant.");

      expect(result).toContain("You are a helpful assistant.");
      expect(result).toContain("## Instructions");
    });

    it("includes selection context when available", () => {
      const deps = createMockDeps("# Selected Code\nfunction test() {}");
      const manager = new ContextManager(deps);

      const result = manager.buildPromptWithDefaultContext("Base prompt.");

      expect(result).toContain("Base prompt.");
      expect(result).toContain("## Instructions");
      expect(result).toContain("# Selected Code");
      expect(result).toContain("function test() {}");
    });

    it("does not include selection section when context is null", () => {
      const deps = createMockDeps(null);
      const manager = new ContextManager(deps);

      const result = manager.buildPromptWithDefaultContext("Base prompt.");

      expect(result).toContain("Base prompt.");
      expect(result).toContain("## Instructions");
      expect(result).not.toContain("# Selected Code");
    });

    it("includes instruction about not repeating code", () => {
      const deps = createMockDeps(null);
      const manager = new ContextManager(deps);

      const result = manager.buildPromptWithDefaultContext("Test.");

      expect(result).toContain("Dont repeat selected code back to user");
    });

    it("includes instruction about context relevance", () => {
      const deps = createMockDeps(null);
      const manager = new ContextManager(deps);

      const result = manager.buildPromptWithDefaultContext("Test.");

      expect(result).toContain("context is insufficient");
    });

    it("maintains correct prompt structure order", () => {
      const deps = createMockDeps("# Selected Code\ncode here");
      const manager = new ContextManager(deps);

      const result = manager.buildPromptWithDefaultContext("Base prompt.");

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
