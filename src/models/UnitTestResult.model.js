const mongoose = require('mongoose');
const { Schema } = mongoose;

const questionEvalSchema = new Schema(
  {
    number:        { type: Number },
    question:      { type: String },
    studentAnswer: { type: String },
    modelAnswer:   { type: String },
    marksAwarded:  { type: Number },
    maxMarks:      { type: Number },
    feedback:      { type: String },
  },
  { _id: false }
);

const sectionEvalSchema = new Schema(
  {
    name:          { type: String },
    type:          { type: String },
    totalMarks:    { type: Number },
    marksObtained: { type: Number },
    questions:     [questionEvalSchema],
  },
  { _id: false }
);

const unitTestResultSchema = new Schema(
  {
    paper:    { type: Schema.Types.ObjectId, ref: 'UnitTestPaper', required: true, index: true },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer',      required: true, index: true },

    answerSheetImages: [{ type: String }], // saved file paths

    maxMarks:      { type: Number, required: true },
    marksObtained: { type: Number, required: true },
    percentage:    { type: Number, required: true },

    sections:        [sectionEvalSchema],
    overallFeedback: { type: String },
    strengths:       [{ type: String }],
    improvements:    [{ type: String }],

    evaluatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

unitTestResultSchema.index({ customer: 1, evaluatedAt: -1 });

module.exports = mongoose.model('UnitTestResult', unitTestResultSchema);
