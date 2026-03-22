/**
 * PDF Service
 *
 * Uses pdf-parse which returns data.pages = [{num, text}, ...]
 * (this version does NOT expose numpages — use data.pages.length instead).
 */
const fs = require('fs');
const pdfParse = require('pdf-parse');

const CHUNK_SIZE = 1000;    // characters per chunk
const CHUNK_OVERLAP = 100;  // overlap between chunks

/**
 * Extract text page-by-page from a PDF.
 * Returns: { pages: [{pdfPageIndex, text}], totalPages }
 */
const extractTextByPage = async (filePath) => {
  const buffer = fs.readFileSync(filePath);

  // pdf-parse (this version) exposes data.pages = [{num, text}, ...]
  // data.num is 1-based page index; data.text is the extracted text for that page.
  const data = await pdfParse(buffer);

  const pages = (data.pages || []).map((p) => ({
    pdfPageIndex: p.num,          // 1-based PDF page index
    text: (p.text || '').trim(),
  }));

  return {
    pages,
    totalPages: pages.length,
  };
};

/**
 * Chunk per-page text using the confirmed page mapping.
 * Each chunk carries the actual printed page number confirmed by the admin.
 *
 * @param {Array}  pages       - [{pdfPageIndex, text}]
 * @param {Array}  pageMapping - [{pdfPageIndex, actualPageNumber}]
 */
const chunkTextByPage = (pages, pageMapping) => {
  const mappingIndex = new Map((pageMapping || []).map((m) => [m.pdfPageIndex, m.actualPageNumber]));
  const chunks = [];
  let chunkIndex = 0;

  for (const page of pages) {
    const actualPageNumber = mappingIndex.get(page.pdfPageIndex) ?? null;
    const cleanText = (page.text || '').replace(/\s+/g, ' ').trim();

    if (!cleanText || cleanText.length < 50) continue;

    let start = 0;
    while (start < cleanText.length) {
      const end = Math.min(start + CHUNK_SIZE, cleanText.length);
      const content = cleanText.slice(start, end).trim();

      if (content.length > 50) {
        chunks.push({
          chunkIndex: chunkIndex++,
          pdfPageIndex: page.pdfPageIndex,
          pageNumber: actualPageNumber,  // actual printed page number
          content,
          tokenCount: Math.ceil(content.length / 4),
        });
      }
      start += CHUNK_SIZE - CHUNK_OVERLAP;
    }
  }

  return chunks;
};

module.exports = { extractTextByPage, chunkTextByPage };
