/**
 * FileProcessorAgent tests — verifies file type detection, token budgeting, and message building.
 */

import { FileProcessorAgent } from "../../src/agent/FileProcessorAgent";

// Mock OCRService and PDFService
jest.mock("../../src/ocr/OCRService", () => ({
  OCRService: class {
    static isSupported(filename: string): boolean {
      const ext = filename.toLowerCase().slice(filename.lastIndexOf("."));
      return [".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp"].includes(ext);
    }
    async extractTextFromBase64(_base64: string, _filename: string) {
      return { text: "OCR extracted text from image", confidence: 95 };
    }
  },
}));

jest.mock("../../src/ocr/PDFService", () => ({
  PDFService: class {
    static isSupported(filename: string): boolean {
      const ext = filename.toLowerCase().slice(filename.lastIndexOf("."));
      return ext === ".pdf";
    }
    async extractTextFromBase64(_base64: string, _filename: string) {
      return { text: "PDF extracted text content", pageCount: 5 };
    }
  },
}));

describe("FileProcessorAgent", () => {
  let agent: FileProcessorAgent;

  beforeEach(() => {
    agent = new FileProcessorAgent();
  });

  describe("getFileType", () => {
    describe("image files", () => {
      it.each([
        ["photo.png", "image"],
        ["image.jpg", "image"],
        ["picture.jpeg", "image"],
        ["animation.gif", "image"],
        ["bitmap.bmp", "image"],
        ["modern.webp", "image"],
        ["UPPERCASE.PNG", "image"],
        ["MixedCase.JpG", "image"],
      ])("returns 'image' for %s", (filename, expected) => {
        expect(agent.getFileType(filename)).toBe(expected);
      });
    });

    describe("PDF files", () => {
      it.each([
        ["document.pdf", "pdf"],
        ["report.PDF", "pdf"],
        ["file.Pdf", "pdf"],
      ])("returns 'pdf' for %s", (filename, expected) => {
        expect(agent.getFileType(filename)).toBe(expected);
      });
    });

    describe("unsupported files", () => {
      it.each([
        "document.docx",
        "spreadsheet.xlsx",
        "archive.zip",
        "script.js",
        "style.css",
        "data.json",
        "noextension",
        "",
      ])("returns null for %s", (filename) => {
        expect(agent.getFileType(filename)).toBeNull();
      });
    });
  });

  describe("processFile", () => {
    it("processes image files using OCRService", async () => {
      const result = await agent.processFile({
        filename: "test.png",
        base64Data: "base64imagedata",
      });

      expect(result.fileType).toBe("image");
      expect(result.extractedText).toBe("OCR extracted text from image");
      expect(result.metadata?.confidence).toBe(95);
    });

    it("processes PDF files using PDFService", async () => {
      const result = await agent.processFile({
        filename: "document.pdf",
        base64Data: "base64pdfdata",
      });

      expect(result.fileType).toBe("pdf");
      expect(result.extractedText).toBe("PDF extracted text content");
      expect(result.metadata?.pageCount).toBe(5);
    });

    it("throws error for unsupported file types", async () => {
      await expect(
        agent.processFile({
          filename: "document.docx",
          base64Data: "base64data",
        })
      ).rejects.toThrow("Unsupported file type: document.docx");
    });
  });

  describe("buildMessages", () => {
    it("returns array with system and user messages", async () => {
      const processedFile = await agent.processFile({
        filename: "test.png",
        base64Data: "base64data",
      });
      const messages = agent.buildMessages(processedFile);

      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe("system");
      expect(messages[1].role).toBe("user");
    });

    it("includes file type context for images", async () => {
      const processedFile = await agent.processFile({
        filename: "test.png",
        base64Data: "base64data",
      });
      const messages = agent.buildMessages(processedFile);
      const systemPrompt = messages[0].content;

      expect(systemPrompt).toContain("Image (OCR extracted)");
    });

    it("includes file type context for PDFs", async () => {
      const processedFile = await agent.processFile({
        filename: "doc.pdf",
        base64Data: "base64data",
      });
      const messages = agent.buildMessages(processedFile);
      const systemPrompt = messages[0].content;

      expect(systemPrompt).toContain("PDF document");
    });

    it("includes extracted text in user message", async () => {
      const processedFile = await agent.processFile({
        filename: "test.png",
        base64Data: "base64data",
      });
      const messages = agent.buildMessages(processedFile);
      const userContent = messages[1].content;

      expect(userContent).toContain("EXTRACTED TEXT");
      expect(userContent).toContain("OCR extracted text from image");
    });

    it("includes user question when provided", async () => {
      const processedFile = await agent.processFile({
        filename: "test.png",
        base64Data: "base64data",
      });
      const messages = agent.buildMessages(processedFile, "What does this say?");
      const userContent = messages[1].content;

      expect(userContent).toContain("User question: What does this say?");
    });

    it("includes filename in user message", async () => {
      const processedFile = await agent.processFile({
        filename: "important-doc.pdf",
        base64Data: "base64data",
      });
      const messages = agent.buildMessages(processedFile);
      const userContent = messages[1].content;

      expect(userContent).toContain("important-doc.pdf");
    });
  });

  describe("processAndBuildMessages", () => {
    it("combines processFile and buildMessages", async () => {
      const messages = await agent.processAndBuildMessages({
        filename: "test.png",
        base64Data: "base64data",
        userMessage: "Summarize this",
      });

      expect(messages).toHaveLength(2);
      expect(messages[1].content).toContain("Summarize this");
    });
  });

  describe("setContextWindow", () => {
    it("updates context window size for token budgeting", () => {
      // Default is 4096, set to larger
      agent.setContextWindow(8192);
      
      // Verify indirectly by checking it doesn't throw
      expect(() => agent.setContextWindow(32000)).not.toThrow();
    });
  });

  describe("token budgeting", () => {
    it("truncates long text to fit within budget", async () => {
      // Create agent with small context window
      const smallAgent = new FileProcessorAgent(1000);
      
      // Mock a very long extracted text
      const longText = "A".repeat(10000);
      jest.spyOn(smallAgent as any, "processFile").mockResolvedValue({
        filename: "test.pdf",
        fileType: "pdf",
        extractedText: longText,
        metadata: { pageCount: 100 },
      });

      const messages = await smallAgent.processAndBuildMessages({
        filename: "test.pdf",
        base64Data: "data",
      });

      const userContent = messages[1].content;
      
      // Should be truncated
      expect(userContent.length).toBeLessThan(longText.length);
      expect(userContent).toContain("content truncated");
    });

    it("keeps text intact when within budget", async () => {
      // Large context window
      const largeAgent = new FileProcessorAgent(100000);
      
      const messages = await largeAgent.processAndBuildMessages({
        filename: "small.png",
        base64Data: "data",
      });

      const userContent = messages[1].content;
      
      // Should NOT be truncated
      expect(userContent).not.toContain("content truncated");
    });
  });
});
