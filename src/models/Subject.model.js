const mongoose = require('mongoose');

const subjectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    syllabus: { type: mongoose.Schema.Types.ObjectId, ref: 'Syllabus', required: true },
    classLevels: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ClassLevel' }],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

subjectSchema.index({ code: 1, syllabus: 1 }, { unique: true });

module.exports = mongoose.model('Subject', subjectSchema);
