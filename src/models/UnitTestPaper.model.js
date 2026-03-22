const mongoose = require('mongoose');
const { Schema } = mongoose;

const questionSchema = new Schema(
  {
    number:           { type: Number, required: true },
    question:         { type: String, required: true },
    options:          [{ type: String }], // MCQ only
    modelAnswer:      { type: String, required: true },
    marksPerQuestion: { type: Number, required: true },
    keyPoints:        [{ type: String }],
  },
  { _id: false }
);

const sectionSchema = new Schema(
  {
    name:       { type: String, required: true },
    type:       { type: String, enum: ['mcq', 'short', 'long'], required: true },
    totalMarks: { type: Number, required: true },
    questions:  [questionSchema],
  },
  { _id: false }
);

const unitTestPaperSchema = new Schema(
  {
    customer:   { type: Schema.Types.ObjectId, ref: 'Customer',   required: true, index: true },
    syllabus:   { type: Schema.Types.ObjectId, ref: 'Syllabus',   required: true },
    classLevel: { type: Schema.Types.ObjectId, ref: 'ClassLevel', required: true },
    subject:    { type: Schema.Types.ObjectId, ref: 'Subject',    required: true },
    chapters:   [{ type: Schema.Types.ObjectId, ref: 'Chapter' }],

    // Denormalized for fast reads
    meta: {
      syllabusName:   String,
      className:      String,
      subjectName:    String,
      chapterTitles:  [String],
      chapterNumbers: [Number],
    },

    maxMarks:  { type: Number, required: true, min: 10, max: 100 },
    paperText: { type: String, required: true }, // Student-facing — NO model answers
    sections:  [sectionSchema],                  // Internal — includes model answers (never sent to client)

    status: {
      type:    String,
      enum:    ['generated', 'attempted', 'evaluated'],
      default: 'generated',
    },
  },
  { timestamps: true }
);

unitTestPaperSchema.index({ customer: 1, createdAt: -1 });

module.exports = mongoose.model('UnitTestPaper', unitTestPaperSchema);
