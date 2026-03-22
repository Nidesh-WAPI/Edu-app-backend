/**
 * Gemini Service — PDF page-number detection using gemini-2.0-flash
 *
 * Sends the PDF as base64 inline data and asks Gemini to identify
 * the actual printed page number visible on each page.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');

const DETECTION_MODEL = 'gemini-2.0-flash';

/**
 * Detect actual printed page numbers from a PDF.
 *
 * Returns an array of:
 * [{ pdfPageIndex: 1, detectedPageNumber: 36, confidence: 'high' }, ...]
 *
 * Falls back to all-null detections when no API key is set.
 */
const detectPageNumbers = async (filePath, totalPages) => {
  if (!process.env.GEMINI_API_KEY) {
    console.log('[Gemini] GEMINI_API_KEY not set — skipping page number detection');
    return Array.from({ length: totalPages }, (_, i) => ({
      pdfPageIndex: i + 1,
      detectedPageNumber: null,
      confidence: 'none',
    }));
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: DETECTION_MODEL });

  const pdfBase64 = fs.readFileSync(filePath).toString('base64');

  const prompt = `You are analyzing a scanned textbook PDF.
This PDF has ${totalPages} pages (PDF page index 1 to ${totalPages}).

For EACH page, find the actual printed page number that is visually shown on that page
(e.g. printed at the top or bottom — like "36", "37"). This is NOT the PDF page index.

Return ONLY a valid JSON array — no explanation, no markdown, just the array:
[
  { "pdfPageIndex": 1, "detectedPageNumber": 36, "confidence": "high" },
  { "pdfPageIndex": 2, "detectedPageNumber": 37, "confidence": "high" },
  { "pdfPageIndex": 3, "detectedPageNumber": null, "confidence": "none" }
]

Rules:
- pdfPageIndex: 1-based sequential page index in this PDF (1 to ${totalPages})
- detectedPageNumber: the printed page number visible on the page, or null if not found
- confidence: "high" = clearly visible, "low" = partially visible or uncertain, "none" = no page number found
- Include ALL ${totalPages} pages in the array`;

  const result = await model.generateContent([
    { text: prompt },
    { inlineData: { data: pdfBase64, mimeType: 'application/pdf' } },
  ]);

  const rawText = result.response.text().trim();

  // Extract JSON array from response (handle markdown code blocks too)
  const jsonMatch = rawText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error('Gemini did not return a valid JSON array for page detection');
  }

  const detections = JSON.parse(jsonMatch[0]);

  // Ensure all pages are covered — fill any gaps
  const detectionMap = new Map(detections.map((d) => [d.pdfPageIndex, d]));
  return Array.from({ length: totalPages }, (_, i) => {
    const idx = i + 1;
    return detectionMap.get(idx) || { pdfPageIndex: idx, detectedPageNumber: null, confidence: 'none' };
  });
};

module.exports = { detectPageNumbers };
