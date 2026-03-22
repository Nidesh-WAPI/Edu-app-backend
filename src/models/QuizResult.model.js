const mongoose = require('mongoose');
const { Schema } = mongoose;

const answerSchema = new Schema({
  question:    { type: String, required: true },
  options:     [{ type: String }],
  correct:     { type: Number, required: true },
  selected:    { type: Number, default: null },
  isCorrect:   { type: Boolean, required: true },
  explanation: { type: String },
  difficulty:  { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
  topic:       { type: String },
}, { _id: false });

const quizResultSchema = new Schema({
  customer:   { type: Schema.Types.ObjectId, ref: 'Customer',   required: true, index: true },
  syllabus:   { type: Schema.Types.ObjectId, ref: 'Syllabus',   required: true },
  classLevel: { type: Schema.Types.ObjectId, ref: 'ClassLevel', required: true },
  subject:    { type: Schema.Types.ObjectId, ref: 'Subject',    required: true },
  chapters:   [{ type: Schema.Types.ObjectId, ref: 'Chapter' }],

  // Denormalized labels — fast reads + AI context
  meta: {
    syllabusName:    String,
    className:       String,
    subjectName:     String,
    chapterTitles:   [String],
    chapterNumbers:  [Number],
  },

  numQuestions:     { type: Number, required: true },
  score:            { type: Number, required: true },   // correct count
  percentage:       { type: Number, required: true },   // 0-100
  timeTakenSeconds: { type: Number },

  answers: [answerSchema],

  // Derived for AI predictions
  weakTopics:   [String],
  strongTopics: [String],

  completedAt: { type: Date, default: Date.now },
}, { timestamps: true });

quizResultSchema.index({ customer: 1, completedAt: -1 });
quizResultSchema.index({ customer: 1, subject: 1 });

module.exports = mongoose.model('QuizResult', quizResultSchema);
