/**
 * FileProcessorAgent - Fast path for file uploads (images/PDFs).
 * 
 * Bypasses context gathering when user uploads a file.
 * Extracts text via OCR (images) or PDF parsing, then sends directly to LLM.
 * 
 * Flow: file upload → process file → buildMessages() → LLM
 * (mirrors CommandAgent pattern)
 */

import { LLMMessage } from "../llm/LLMTypes";
import { OCRService } from "../ocr/OCRService";
import { PDFService } from "../ocr/PDFService";
import { TokenBudget } from "../context/TokenBudget";

// ─── Prompt Components ────────────────────────────────────────────

const BASE_PROMPT = `You are a helpful assistant analyzing content extracted from a user-uploaded file.

RULES:
- Analyze the extracted text thoroughly
- If asked a question about the content, answer based on what's in the text
- If the text appears garbled or incomplete, mention that the extraction may have issues
- Be concise but comprehensive in your analysis
- Format your response clearly with sections if the content is long`;

const IMAGE_CONTEXT = `
FILE TYPE: Image (OCR extracted)
Note: Text was extracted using OCR. There may be minor errors in recognition.`;

const PDF_CONTEXT = `
FILE TYPE: PDF document
Note: Text was extracted directly from the PDF. Formatting may differ from original.`;

// ─── Types ────────────────────────────────────────────────────────

export interface FileInput {
  filename: string;
  base64Data: string;
  userMessage?: string; // Optional question about the file
}

export interface ProcessedFile {
  filename: string;
  fileType: "image" | "pdf";
  extractedText: string;
  metadata?: {
    confidence?: number; // For OCR
    pageCount?: number;  // For PDF
  };
}

// ─── FileProcessorAgent Class ─────────────────────────────────────

export class FileProcessorAgent {
  private ocrService: OCRService;
  private pdfService: PDFService;
  private tokenBudget: TokenBudget;

  constructor(contextWindowSize?: number) {
    this.ocrService = new OCRService();
    this.pdfService = new PDFService();
    this.tokenBudget = new TokenBudget(contextWindowSize);
  }

  setContextWindow(size: number): void {
    this.tokenBudget.setContextWindow(size);
  }

  getFileType(filename: string): "image" | "pdf" | null {
    if (OCRService.isSupported(filename)) return "image";
    if (PDFService.isSupported(filename)) return "pdf";
    return null;
  }

  async processFile(input: FileInput): Promise<ProcessedFile> {
    const { filename, base64Data } = input;
    const fileType = this.getFileType(filename);

    if (!fileType) {
      throw new Error(`Unsupported file type: ${filename}`);
    }

    if (fileType === "image") {
      const result = await this.ocrService.extractTextFromBase64(base64Data, filename);
      return {
        filename,
        fileType: "image",
        extractedText: result.text,
        metadata: { confidence: result.confidence },
      };
    }

    // PDF
    const result = await this.pdfService.extractTextFromBase64(base64Data, filename);
    return {
      filename,
      fileType: "pdf",
      extractedText: result.text,
      metadata: { pageCount: result.pageCount },
    };
  }

  buildMessages(processedFile: ProcessedFile, userMessage?: string): LLMMessage[] {
    const systemPrompt = this.buildPrompt(processedFile);
    
    // Calculate available tokens for extracted text
    const maxTextTokens = this.calculateTextBudget(userMessage);
    const truncatedText = this.truncateToTokenBudget(processedFile.extractedText, maxTextTokens);
    
    // Update processedFile with truncated text
    const truncatedFile = { ...processedFile, extractedText: truncatedText };
    const userContent = this.buildUserContent(truncatedFile, userMessage);

    return [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ];
  }

  async processAndBuildMessages(input: FileInput): Promise<LLMMessage[]> {
    const processedFile = await this.processFile(input);
    return this.buildMessages(processedFile, input.userMessage);
  }

  // ─── Private Helpers ────────────────────────────────────────────

  private buildPrompt(processedFile: ProcessedFile): string {
    const contextInfo = processedFile.fileType === "image" ? IMAGE_CONTEXT : PDF_CONTEXT;
    
    let metadataInfo = "";
    if (processedFile.metadata) {
      if (processedFile.metadata.confidence !== undefined) {
        metadataInfo = `\nOCR Confidence: ${processedFile.metadata.confidence.toFixed(1)}%`;
      }
      if (processedFile.metadata.pageCount !== undefined) {
        metadataInfo = `\nPage Count: ${processedFile.metadata.pageCount}`;
      }
    }

    return `${BASE_PROMPT}
${contextInfo}${metadataInfo}`;
  }

  private buildUserContent(processedFile: ProcessedFile, userMessage?: string): string {
    const fileInfo = `[Uploaded file: ${processedFile.filename}]`;
    const extractedContent = `\n\n--- EXTRACTED TEXT ---\n${processedFile.extractedText}\n--- END EXTRACTED TEXT ---`;
    
    if (userMessage && userMessage.trim()) {
      return `${fileInfo}${extractedContent}\n\nUser question: ${userMessage.trim()}`;
    }
    
    return `${fileInfo}${extractedContent}\n\nPlease analyze this content and provide a summary of what it contains.`;
  }

  /**
   * Calculate token budget available for extracted text.
   */
  private calculateTextBudget(userMessage?: string): number {
    const systemPromptTokens = this.tokenBudget.estimateTokens(BASE_PROMPT + IMAGE_CONTEXT);
    const userMessageTokens = userMessage ? this.tokenBudget.estimateTokens(userMessage) : 0;
    
    return this.tokenBudget.calculateAvailableBudget(systemPromptTokens, userMessageTokens);
  }

  /**
   * Truncate text to fit within token budget.
   * Keeps beginning and end of text for better context.
   */
  private truncateToTokenBudget(text: string, maxTokens: number): string {
    const currentTokens = this.tokenBudget.estimateTokens(text);
    
    if (currentTokens <= maxTokens) {
      return text;
    }

    // Keep 70% from start, 30% from end
    const ratio = maxTokens / currentTokens;
    const maxChars = Math.floor(text.length * ratio);
    const startChars = Math.floor(maxChars * 0.7);
    const endChars = maxChars - startChars;

    const startPart = text.slice(0, startChars);
    const endPart = text.slice(-endChars);
    
    return `${startPart}\n\n[... content truncated ...]\n\n${endPart}`;
  }

  private estimateTokens(text: string): number {
    return this.tokenBudget.estimateTokens(text);
  }
}
