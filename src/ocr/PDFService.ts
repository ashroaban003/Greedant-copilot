/**
 * PDFService - Extracts text from PDF files using pdf-parse
 * 
 * Lightweight PDF text extraction. Works with text-based PDFs.
 * For scanned PDFs (image-only), returns minimal/no text.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse") as (buffer: Buffer) => Promise<{ text: string; numpages: number }>;

export interface PDFResult {
  text: string;
  pageCount: number;
}

export class PDFService {
  private static readonly SUPPORTED_EXTENSIONS = [".pdf"];

  static isSupported(filename: string): boolean {
    const ext = filename.toLowerCase().slice(filename.lastIndexOf("."));
    return this.SUPPORTED_EXTENSIONS.includes(ext);
  }

  async extractText(pdfBuffer: Buffer, filename: string): Promise<PDFResult> {
    try {
      const result = await pdfParse(pdfBuffer);

      const text = result.text.trim();
      const pageCount = result.numpages;

      if (!text) {
        return {
          text: "[No text detected in PDF - may be a scanned/image-only PDF]",
          pageCount,
        };
      }

      return { text, pageCount };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`PDF parsing failed for ${filename}: ${message}`);
    }
  }

  async extractTextFromBase64(base64Data: string, filename: string): Promise<PDFResult> {
    const buffer = Buffer.from(base64Data, "base64");
    return this.extractText(buffer, filename);
  }
}
