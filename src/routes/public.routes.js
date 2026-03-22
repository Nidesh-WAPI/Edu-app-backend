/**
 * Public routes — no authentication required.
 * Used by the customer app to load syllabus / class / subject lists.
 */
const express = require('express');
const Syllabus = require('../models/Syllabus.model');
const ClassLevel = require('../models/ClassLevel.model');
const Subject = require('../models/Subject.model');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');

const router = express.Router();

// GET /api/v1/public/syllabuses
router.get('/syllabuses', asyncHandler(async (req, res) => {
  const syllabuses = await Syllabus.find({ isActive: true }).select('name code').sort('name');
  res.json(new ApiResponse(200, 'Syllabuses fetched', syllabuses));
}));

// GET /api/v1/public/classes?syllabus=<id>
router.get('/classes', asyncHandler(async (req, res) => {
  const filter = { isActive: true };
  if (req.query.syllabus) filter.syllabus = req.query.syllabus;
  const classes = await ClassLevel.find(filter).select('name grade syllabus').sort('grade');
  res.json(new ApiResponse(200, 'Classes fetched', classes));
}));

// GET /api/v1/public/subjects?syllabus=<id>
// Note: classLevel is intentionally NOT filtered here — subjects are syllabus-scoped.
// Class-level filtering happens at chapter/chunk query time during AI chat.
router.get('/subjects', asyncHandler(async (req, res) => {
  const filter = { isActive: true };
  if (req.query.syllabus) filter.syllabus = req.query.syllabus;
  const subjects = await Subject.find(filter).select('name code').sort('name');
  res.json(new ApiResponse(200, 'Subjects fetched', subjects));
}));

// GET /api/v1/public/chapters?syllabus=<id>&classLevel=<id>&subject=<id>
const Chapter = require('../models/Chapter.model');
router.get('/chapters', asyncHandler(async (req, res) => {
  const filter = { status: 'ready' };
  if (req.query.syllabus)    filter.syllabus    = req.query.syllabus;
  if (req.query.classLevel)  filter.classLevel  = req.query.classLevel;
  if (req.query.subject)     filter.subject     = req.query.subject;
  const chapters = await Chapter.find(filter)
    .select('title chapterNumber totalChunks')
    .sort('chapterNumber');
  res.json(new ApiResponse(200, 'Chapters fetched', chapters));
}));

module.exports = router;
