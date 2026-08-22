/**
 * PDFService - Extracts text from PDF files
 * 
 * Strategy:
 * 1. Try pdf-parse for native text extraction (fast)
 * 2. If no/little text found, fallback to OCR via poppler CLI
 *    - Uses pdftoppm (poppler-utils) to render pages as images
 *    - Uses OCRService to extract text from images
 * 
 * Requires: poppler-utils installed on system
 *   macOS: brew install poppler
 *   Ubuntu/Debian: apt install poppler-utils
 *   Windows: choco install poppler or download from https://poppler.freedesktop.org/
 */

import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { OCRService } from "./OCRService";

const execAsync = promisify(exec);

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse") as (buffer: Buffer) => Promise<{ text: string; numpages: number }>;

// Minimum text length to consider PDF as "text-based" vs "scanned"
const MIN_TEXT_THRESHOLD = 50;

// Max pages to OCR (to prevent very long processing)
const MAX_OCR_PAGES = 20;

export interface PDFResult {
  text: string;
  pageCount: number;
}

export class PDFService {
  private static readonly SUPPORTED_EXTENSIONS = [".pdf"];
  private ocrService: OCRService;

  constructor() {
    this.ocrService = new OCRService();
  }

  static isSupported(filename: string): boolean {
    const ext = filename.toLowerCase().slice(filename.lastIndexOf("."));
    return this.SUPPORTED_EXTENSIONS.includes(ext);
  }

  /**
   * Extract text from a PDF buffer.
   * Tries native extraction first, falls back to OCR for scanned PDFs.
   */
  async extractText(pdfBuffer: Buffer, filename: string): Promise<PDFResult> {
    try {
      // 1. Try native text extraction (fast)
      const result = await pdfParse(pdfBuffer);
      const text = result.text.trim();
      const pageCount = result.numpages;

      // 2. If sufficient text found, return it
      if (text.length >= MIN_TEXT_THRESHOLD) {
        return { text, pageCount };
      }
      console.log("popeller is needed , we are using popeller to covert pdf to image")
      // 3. Little/no text — likely scanned PDF, fallback to OCR
      return this.extractTextViaOCR(pdfBuffer, pageCount, filename);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`PDF parsing failed for ${filename}: ${message}`);
    }
  }

  /**
   * Extract text from base64-encoded PDF.
   */
  async extractTextFromBase64(base64Data: string, filename: string): Promise<PDFResult> {
    const buffer = Buffer.from(base64Data, "base64");
    return this.extractText(buffer, filename);
  }

  /**
   * Check if poppler (pdftoppm) is available on the system.
   */
  private async isPopperAvailable(): Promise<boolean> {
    try {
      await execAsync("pdftoppm -v");
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Fallback: Render PDF pages as images using poppler and OCR them.
   */
  private async extractTextViaOCR(
    pdfBuffer: Buffer,
    pageCount: number,
    filename: string
  ): Promise<PDFResult> {
    // Check if poppler is available
    const hasPoppler = await this.isPopperAvailable();
    if (!hasPoppler) {
      return {
        text: `[This PDF appears to be scanned/image-based with minimal extractable text.

To enable OCR for scanned PDFs, install poppler-utils:
  macOS: brew install poppler
  Ubuntu/Debian: sudo apt install poppler-utils
  Windows: choco install poppler

Alternatively, export pages as images (PNG/JPG) and upload those instead.]`,
        pageCount,
      };
    }

    // Create temp directory for processing
    const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "greedant-pdf-"));
    const pdfPath = path.join(tempDir, "input.pdf");

    try {
      // Write PDF to temp file
      await fs.promises.writeFile(pdfPath, pdfBuffer);

      const pagesToProcess = Math.min(pageCount, MAX_OCR_PAGES);
      const pageTexts: string[] = [];

      // Convert PDF pages to PNG images using pdftoppm
      const outputPrefix = path.join(tempDir, "page");
      await execAsync(
        `pdftoppm -png -r 200 -l ${pagesToProcess} "${pdfPath}" "${outputPrefix}"`
      );

      // Read generated images and OCR them
      const files = await fs.promises.readdir(tempDir);
      const imageFiles = files
        .filter(f => f.startsWith("page") && f.endsWith(".png"))
        .sort();

      for (const imageFile of imageFiles) {
        const imagePath = path.join(tempDir, imageFile);
        const imageBuffer = await fs.promises.readFile(imagePath);

        const ocrResult = await this.ocrService.extractText(
          imageBuffer,
          `${filename}-${imageFile}`
        );

        if (!ocrResult.text.startsWith("[No text")) {
          pageTexts.push(ocrResult.text);
        }
      }

      const combinedText = pageTexts.join("\n\n--- Page Break ---\n\n");

      if (!combinedText) {
        return {
          text: "[No text detected in PDF]",
          pageCount,
        };
      }

      const truncationNote = pageCount > MAX_OCR_PAGES
        ? `\n\n[Note: Only first ${MAX_OCR_PAGES} of ${pageCount} pages were processed]`
        : "";

      return {
        text: combinedText + truncationNote,
        pageCount,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        text: `[OCR extraction failed: ${message}. For scanned PDFs, try uploading pages as images.]`,
        pageCount,
      };
    } finally {
      // Cleanup temp directory
      try {
        const files = await fs.promises.readdir(tempDir);
        for (const file of files) {
          await fs.promises.unlink(path.join(tempDir, file));
        }
        await fs.promises.rmdir(tempDir);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}
