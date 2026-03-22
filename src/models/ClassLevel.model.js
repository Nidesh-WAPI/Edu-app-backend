const mongoose = require('mongoose');

const classLevelSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    grade: { type: Number, required: true, min: 1, max: 12 },
    syllabus: { type: mongoose.Schema.Types.ObjectId, ref: 'Syllabus', required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

classLevelSchema.index({ grade: 1, syllabus: 1 }, { unique: true });

module.exports = mongoose.model('ClassLevel', classLevelSchema);
