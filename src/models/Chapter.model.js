const mongoose = require('mongoose');

const chapterSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    chapterNumber: { type: Number, required: true },
    description: { type: String, trim: true },
    syllabus: { type: mongoose.Schema.Types.ObjectId, ref: 'Syllabus', required: true },
    classLevel: { type: mongoose.Schema.Types.ObjectId, ref: 'ClassLevel', required: true },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    pdfFileName: { type: String },
    pdfOriginalName: { type: String },
    pdfSize: { type: Number },
    pdfPath: { type: String },
    status: {
      type: String,
      enum: ['uploaded', 'processing', 'ready', 'failed'],
      default: 'uploaded',
    },
    totalPages: { type: Number, default: 0 },
    totalChunks: { type: Number, default: 0 },
    processingError: { type: String },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    // Confirmed mapping of PDF page index → actual printed page number
    // e.g. [{pdfPageIndex: 1, actualPageNumber: 36}, ...]
    pageMapping: [
      {
        pdfPageIndex: { type: Number, required: true },
        actualPageNumber: { type: Number, default: null },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Chapter', chapterSchema);
