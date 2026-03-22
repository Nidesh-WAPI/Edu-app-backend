const mongoose = require('mongoose');

// Designed for MongoDB Atlas Vector Search
// Create a vector search index on `embedding` field (dimension: 3072 for Gemini gemini-embedding-001)
const chapterChunkSchema = new mongoose.Schema(
  {
    chapter: { type: mongoose.Schema.Types.ObjectId, ref: 'Chapter', required: true, index: true },
    syllabus: { type: mongoose.Schema.Types.ObjectId, ref: 'Syllabus', required: true },
    classLevel: { type: mongoose.Schema.Types.ObjectId, ref: 'ClassLevel', required: true },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    chunkIndex: { type: Number, required: true },
    pdfPageIndex: { type: Number },        // sequential page index in the PDF (1-based)
    pageNumber: { type: Number },          // actual printed page number from the textbook
    content: { type: String, required: true },
    // 3072-dim vector for Gemini gemini-embedding-001
    embedding: { type: [Number], default: undefined },
    embeddingModel: { type: String, default: null },
    tokenCount: { type: Number },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ChapterChunk', chapterChunkSchema);
