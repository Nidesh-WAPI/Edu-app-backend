const asyncHandler  = require('../utils/asyncHandler');
const ApiResponse   = require('../utils/ApiResponse');
const ApiError      = require('../utils/ApiError');
const Syllabus      = require('../models/Syllabus.model');
const ClassLevel    = require('../models/ClassLevel.model');
const Subject       = require('../models/Subject.model');
const Chapter       = require('../models/Chapter.model');
const ChapterChunk  = require('../models/ChapterChunk.model');
const UnitTestPaper = require('../models/UnitTestPaper.model');
const UnitTestResult = require('../models/UnitTestResult.model');
const { generateUnitTestPaper, evaluateAnswerSheet } = require('../services/unitTest.service');

const MAX_PAPERS = 4;

// ── POST /api/v1/unit-test/generate ──────────────────────────────────────────
const generatePaper = asyncHandler(async (req, res) => {
  const { syllabusId, classLevelId, subjectId, chapterIds, maxMarks } = req.body;

  if (!syllabusId || !classLevelId || !subjectId) {
    throw new ApiError(400, 'syllabusId, classLevelId, and subjectId are required');
  }
  if (!Array.isArray(chapterIds) || chapterIds.length === 0) {
    throw new ApiError(400, 'chapterIds[] is required (select 1–4 chapters)');
  }
  if (chapterIds.length > 4) {
    throw new ApiError(400, 'Maximum 4 chapters allowed per unit test');
  }

  const marks = parseInt(maxMarks, 10);
  if (isNaN(marks) || marks < 10 || marks > 100) {
    throw new ApiError(400, 'maxMarks must be between 10 and 100');
  }

  // Enforce 4-paper limit
  const existingCount = await UnitTestPaper.countDocuments({ customer: req.customer.id });
  if (existingCount >= MAX_PAPERS) {
    throw new ApiError(
      409,
      `You already have ${MAX_PAPERS} saved papers. Please delete at least one before generating a new paper.`
    );
  }

  // Fetch meta
  const [syllabus, classLevel, subject, chapters] = await Promise.all([
    Syllabus.findById(syllabusId).select('name'),
    ClassLevel.findById(classLevelId).select('name grade'),
    Subject.findById(subjectId).select('name'),
    Chapter.find({ _id: { $in: chapterIds }, status: 'ready' }).select('title chapterNumber'),
  ]);

  if (!syllabus || !classLevel || !subject) {
    throw new ApiError(404, 'Invalid syllabus, class, or subject selection');
  }
  if (!chapters.length) {
    throw new ApiError(400, 'Selected chapters are not ready — please wait for processing to complete');
  }

  // Fetch context chunks from selected chapters
  const contextChunks = await ChapterChunk.find({
    chapter: { $in: chapters.map((c) => c._id) },
  })
    .select('content')
    .sort({ chunkIndex: 1 })
    .limit(20);

  const className    = `${classLevel.name}${classLevel.grade ? ` (Grade ${classLevel.grade})` : ''}`;
  const chapterTitles = chapters.map((c) => `Ch. ${c.chapterNumber}: ${c.title}`);

  // Generate paper via AI
  const { paperText, sections } = await generateUnitTestPaper({
    syllabusName: syllabus.name,
    className,
    subjectName:  subject.name,
    chapterTitles,
    maxMarks:     marks,
    contextChunks,
  });

  // Save paper (sections with model answers stored in DB only — never returned to client)
  const paper = await UnitTestPaper.create({
    customer:   req.customer.id,
    syllabus:   syllabusId,
    classLevel: classLevelId,
    subject:    subjectId,
    chapters:   chapters.map((c) => c._id),
    meta: {
      syllabusName:   syllabus.name,
      className,
      subjectName:    subject.name,
      chapterTitles,
      chapterNumbers: chapters.map((c) => c.chapterNumber),
    },
    maxMarks:  marks,
    paperText,
    sections,
  });

  // Return paper to student — NO model answers / marking scheme
  res.status(201).json(new ApiResponse(201, 'Question paper generated successfully', {
    paperId:   paper._id,
    paperText: paper.paperText,
    maxMarks:  paper.maxMarks,
    meta:      paper.meta,
    createdAt: paper.createdAt,
  }));
});

// ── GET /api/v1/unit-test/papers ─────────────────────────────────────────────
const getMyPapers = asyncHandler(async (req, res) => {
  const papers = await UnitTestPaper.find({ customer: req.customer.id })
    .select('-sections') // never expose model answers
    .sort({ createdAt: -1 });

  // Attach result summary to each paper
  const paperIds = papers.map((p) => p._id);
  const results  = await UnitTestResult.find({
    paper:    { $in: paperIds },
    customer: req.customer.id,
  }).select('paper marksObtained maxMarks percentage evaluatedAt');

  const resultMap = {};
  results.forEach((r) => { resultMap[r.paper.toString()] = r; });

  const papersWithResults = papers.map((p) => ({
    ...p.toObject(),
    result: resultMap[p._id.toString()] || null,
  }));

  res.json(new ApiResponse(200, 'Papers fetched', {
    papers: papersWithResults,
    count:  papers.length,
  }));
});

// ── DELETE /api/v1/unit-test/papers/:id ──────────────────────────────────────
const deletePaper = asyncHandler(async (req, res) => {
  const paper = await UnitTestPaper.findOne({ _id: req.params.id, customer: req.customer.id });
  if (!paper) throw new ApiError(404, 'Paper not found');

  await UnitTestResult.deleteMany({ paper: paper._id });
  await UnitTestPaper.findByIdAndDelete(paper._id);

  res.json(new ApiResponse(200, 'Paper deleted successfully'));
});

// ── POST /api/v1/unit-test/papers/:id/evaluate ───────────────────────────────
const evaluatePaper = asyncHandler(async (req, res) => {
  const paper = await UnitTestPaper.findOne({ _id: req.params.id, customer: req.customer.id });
  if (!paper) throw new ApiError(404, 'Paper not found');

  const existingResult = await UnitTestResult.findOne({ paper: paper._id, customer: req.customer.id });
  if (existingResult) {
    throw new ApiError(409, 'This paper has already been evaluated. View your result from My Papers.');
  }

  if (!req.files || req.files.length === 0) {
    throw new ApiError(400, 'Please upload at least one image of your answer sheet');
  }

  // Evaluate via Claude Vision
  const evaluation = await evaluateAnswerSheet({
    paper,
    imageFiles: req.files,
  });

  // Save evaluation result
  const result = await UnitTestResult.create({
    paper:             paper._id,
    customer:          req.customer.id,
    answerSheetImages: req.files.map((f) => f.path),
    maxMarks:          paper.maxMarks,
    marksObtained:     evaluation.totalMarksObtained,
    percentage:        evaluation.percentage,
    sections:          evaluation.sections,
    overallFeedback:   evaluation.overallFeedback || '',
    strengths:         evaluation.strengths || [],
    improvements:      evaluation.improvements || [],
  });

  // Mark paper as evaluated
  await UnitTestPaper.findByIdAndUpdate(paper._id, { status: 'evaluated' });

  res.status(201).json(new ApiResponse(201, 'Answer sheet evaluated successfully', {
    resultId:       result._id,
    marksObtained:  result.marksObtained,
    maxMarks:       result.maxMarks,
    percentage:     result.percentage,
    sections:       result.sections,
    overallFeedback: result.overallFeedback,
    strengths:      result.strengths,
    improvements:   result.improvements,
    evaluatedAt:    result.evaluatedAt,
    meta:           paper.meta,
  }));
});

// ── GET /api/v1/unit-test/papers/:id/result ──────────────────────────────────
const getResult = asyncHandler(async (req, res) => {
  // Verify paper belongs to this customer
  const paper = await UnitTestPaper.findOne({ _id: req.params.id, customer: req.customer.id }).select('meta maxMarks');
  if (!paper) throw new ApiError(404, 'Paper not found');

  const result = await UnitTestResult.findOne({ paper: paper._id, customer: req.customer.id });
  if (!result) throw new ApiError(404, 'No result found for this paper. Please upload your answer sheet first.');

  res.json(new ApiResponse(200, 'Result fetched', {
    ...result.toObject(),
    meta: paper.meta,
  }));
});

module.exports = { generatePaper, getMyPapers, deletePaper, evaluatePaper, getResult };
