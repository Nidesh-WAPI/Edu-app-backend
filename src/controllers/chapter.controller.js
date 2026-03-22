const path = require('path');
const fs = require('fs');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');
const Chapter = require('../models/Chapter.model');
const ChapterChunk = require('../models/ChapterChunk.model');
const { extractTextByPage, chunkTextByPage } = require('../services/pdf.service'); // pdf-parse: data.pages=[{num,text}]
const { detectPageNumbers } = require('../services/gemini.service');
const { generateEmbeddings, isEnabled, EMBEDDING_MODEL } = require('../services/embedding.service');

// ── List chapters ─────────────────────────────────────────────────────────────
const getChapters = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.syllabus) filter.syllabus = req.query.syllabus;
  if (req.query.classLevel) filter.classLevel = req.query.classLevel;
  if (req.query.subject) filter.subject = req.query.subject;

  const chapters = await Chapter.find(filter)
    .populate('syllabus', 'name code')
    .populate('classLevel', 'name grade')
    .populate('subject', 'name code')
    .sort({ createdAt: -1 });

  res.json(new ApiResponse(200, 'Chapters fetched', chapters));
});

// ── Get single chapter ────────────────────────────────────────────────────────
const getChapter = asyncHandler(async (req, res) => {
  const chapter = await Chapter.findById(req.params.id)
    .populate('syllabus', 'name code')
    .populate('classLevel', 'name grade')
    .populate('subject', 'name code');
  if (!chapter) throw new ApiError(404, 'Chapter not found');
  res.json(new ApiResponse(200, 'Chapter fetched', chapter));
});

// ── Step 1: Analyze PDF — extract pages + detect page numbers via Gemini ──────
const analyzeChapter = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'PDF file is required');

  const { pages, totalPages } = await extractTextByPage(req.file.path);

  // Detect printed page numbers using Gemini Vision
  const detections = await detectPageNumbers(req.file.path, totalPages);

  // Merge: combine page text preview with detection results
  const analysis = pages.map((page) => {
    const det = detections.find((d) => d.pdfPageIndex === page.pdfPageIndex) || {};
    return {
      pdfPageIndex: page.pdfPageIndex,
      textPreview: page.text.substring(0, 150).replace(/\s+/g, ' ').trim(),
      detectedPageNumber: det.detectedPageNumber ?? null,
      confidence: det.confidence || 'none',
    };
  });

  const missingCount = analysis.filter((p) => !p.detectedPageNumber).length;

  res.json(
    new ApiResponse(200, 'PDF analyzed successfully', {
      tempFileName: req.file.filename,
      totalPages,
      analysis,
      missingCount,
    })
  );
});

// ── Step 2: Confirm upload — save chapter with confirmed page mapping ──────────
const confirmChapterUpload = asyncHandler(async (req, res) => {
  const { title, chapterNumber, description, syllabus, classLevel, subject, tempFileName, pageMapping } = req.body;

  if (!title || !chapterNumber || !syllabus || !classLevel || !subject || !tempFileName || !pageMapping) {
    throw new ApiError(400, 'Missing required fields');
  }

  // Locate the temp uploaded file
  const uploadsDir = path.join(__dirname, '../../uploads');
  const tempPath = path.join(uploadsDir, tempFileName);
  if (!fs.existsSync(tempPath)) {
    throw new ApiError(400, 'Uploaded file not found. Please re-upload the PDF.');
  }

  const parsedMapping = typeof pageMapping === 'string' ? JSON.parse(pageMapping) : pageMapping;

  // Persist chapter record
  const chapter = await Chapter.create({
    title,
    chapterNumber: Number(chapterNumber),
    description,
    syllabus,
    classLevel,
    subject,
    pdfFileName: tempFileName,
    pdfOriginalName: tempFileName,
    pdfPath: tempPath,
    pageMapping: parsedMapping,
    status: 'processing',
    uploadedBy: req.user.id,
  });

  // Kick off processing in background
  processPdf(chapter).catch((err) => {
    console.error(`[PDF] Processing failed for chapter ${chapter._id}:`, err.message);
  });

  res.status(201).json(new ApiResponse(201, 'Chapter saved — processing started', chapter));
});

// ── Re-trigger embedding for existing chapter ─────────────────────────────────
const embedChapter = asyncHandler(async (req, res) => {
  const chapter = await Chapter.findById(req.params.id);
  if (!chapter) throw new ApiError(404, 'Chapter not found');
  if (!isEnabled()) throw new ApiError(400, 'GEMINI_API_KEY not configured');

  processPdf(chapter, true).catch(console.error);
  res.json(new ApiResponse(200, 'Embedding started'));
});

// ── Delete chapter ────────────────────────────────────────────────────────────
const deleteChapter = asyncHandler(async (req, res) => {
  const chapter = await Chapter.findByIdAndDelete(req.params.id);
  if (!chapter) throw new ApiError(404, 'Chapter not found');

  await ChapterChunk.deleteMany({ chapter: chapter._id });
  if (chapter.pdfPath && fs.existsSync(chapter.pdfPath)) {
    fs.unlinkSync(chapter.pdfPath);
  }

  res.json(new ApiResponse(200, 'Chapter deleted'));
});

// ── Internal: extract → chunk (with actual page numbers) → embed → store ──────
async function processPdf(chapter, reEmbed = false) {
  try {
    const { pages, totalPages } = await extractTextByPage(chapter.pdfPath);

    // Use confirmed pageMapping from chapter document
    const pageMapping = chapter.pageMapping || [];
    const chunks = chunkTextByPage(pages, pageMapping);

    if (!reEmbed) {
      await ChapterChunk.deleteMany({ chapter: chapter._id });
    }

    const texts = chunks.map((c) => c.content);
    const embeddings = await generateEmbeddings(texts);

    const chunkDocs = chunks.map((chunk, i) => ({
      chapter: chapter._id,
      syllabus: chapter.syllabus,
      classLevel: chapter.classLevel,
      subject: chapter.subject,
      chunkIndex: chunk.chunkIndex,
      pdfPageIndex: chunk.pdfPageIndex,
      pageNumber: chunk.pageNumber,
      content: chunk.content,
      tokenCount: chunk.tokenCount,
      embedding: embeddings[i] || undefined,
      embeddingModel: embeddings[i] ? EMBEDDING_MODEL : null,
    }));

    await ChapterChunk.insertMany(chunkDocs);

    await Chapter.findByIdAndUpdate(chapter._id, {
      status: 'ready',
      totalPages,
      totalChunks: chunkDocs.length,
    });

    console.log(`[PDF] Chapter "${chapter.title}" processed — ${chunkDocs.length} chunks across ${totalPages} pages`);
  } catch (err) {
    await Chapter.findByIdAndUpdate(chapter._id, {
      status: 'failed',
      processingError: err.message,
    });
    throw err;
  }
}

module.exports = { getChapters, getChapter, analyzeChapter, confirmChapterUpload, embedChapter, deleteChapter };
