/**
 * OCRService - Extracts text from images using Tesseract.js
 * 
 * Lightweight OCR for PNG, JPG, JPEG, GIF, BMP, WebP images.
 * Returns extracted text for direct LLM processing.
 */

import Tesseract from "tesseract.js";

export interface OCRResult {
  text: string;
  confidence: number;
}

export class OCRService {
  private static readonly SUPPORTED_EXTENSIONS = [
    ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp"
  ];

  /**
   * Check if a file extension is supported for OCR.
   */
  static isSupported(filename: string): boolean {
    const ext = filename.toLowerCase().slice(filename.lastIndexOf("."));
    return this.SUPPORTED_EXTENSIONS.includes(ext);
  }

  async extractText(imageBuffer: Buffer, filename: string): Promise<OCRResult> {
    try {
      const result = await Tesseract.recognize(imageBuffer, "eng", {
        logger: () => {}, // Silent - no progress logging
      });

      const text = result.data.text.trim();
      const confidence = result.data.confidence;

      if (!text) {
        return {
          text: "[No text detected in image]",
          confidence: 0,
        };
      }

      return { text, confidence };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`OCR failed for ${filename}: ${message}`);
    }
  }
  
  async extractTextFromBase64(base64Data: string, filename: string): Promise<OCRResult> {
    const buffer = Buffer.from(base64Data, "base64");
    return this.extractText(buffer, filename);
  }
}
