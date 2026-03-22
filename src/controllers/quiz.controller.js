const asyncHandler = require('../utils/asyncHandler');
const ApiResponse  = require('../utils/ApiResponse');
const ApiError     = require('../utils/ApiError');
const Syllabus     = require('../models/Syllabus.model');
const ClassLevel   = require('../models/ClassLevel.model');
const Subject      = require('../models/Subject.model');
const Chapter      = require('../models/Chapter.model');
const ChapterChunk = require('../models/ChapterChunk.model');
const QuizResult   = require('../models/QuizResult.model');
const { generateQuizQuestions, analyzeAnswers, MIN_QUESTIONS, MAX_QUESTIONS } = require('../services/quiz.service');

/* ── POST /api/v1/quiz/generate ─────────────────────────────────────────────── */
const generateQuiz = asyncHandler(async (req, res) => {
  const { syllabusId, classLevelId, subjectId, chapterIds, numQuestions } = req.body;

  if (!syllabusId || !classLevelId || !subjectId || !Array.isArray(chapterIds) || !chapterIds.length) {
    throw new ApiError(400, 'syllabusId, classLevelId, subjectId, and chapterIds[] are required');
  }
  if (chapterIds.length > 4) throw new ApiError(400, 'Maximum 4 chapters allowed per quiz');

  const n = parseInt(numQuestions, 10);
  if (isNaN(n) || n < MIN_QUESTIONS || n > MAX_QUESTIONS) {
    throw new ApiError(400, `Number of questions must be between ${MIN_QUESTIONS} and ${MAX_QUESTIONS}`);
  }

  const [syllabus, classLevel, subject, chapters] = await Promise.all([
    Syllabus.findById(syllabusId).select('name'),
    ClassLevel.findById(classLevelId).select('name grade'),
    Subject.findById(subjectId).select('name'),
    Chapter.find({ _id: { $in: chapterIds }, status: 'ready' }).select('title chapterNumber totalChunks'),
  ]);

  if (!syllabus || !classLevel || !subject) throw new ApiError(404, 'Invalid syllabus, class, or subject');
  if (!chapters.length) throw new ApiError(400, 'Selected chapters are not ready. Please wait for processing to complete.');

  // Fetch ALL chunks for the selected chapters, then randomly sample them
  // so each quiz attempt draws from a different spread of content.
  const allChunks = await ChapterChunk.find({
    chapter: { $in: chapters.map((c) => c._id) },
  }).select('content chunkIndex');

  // Fisher-Yates shuffle → take a fresh random sample every time
  const shuffled = allChunks.sort(() => Math.random() - 0.5);
  const chunks   = shuffled.slice(0, MAX_QUESTIONS + 5);

  if (!chunks.length) {
    throw new ApiError(400, 'No textbook content found in selected chapters.');
  }

  const className = `${classLevel.name}${classLevel.grade ? ` (Grade ${classLevel.grade})` : ''}`;

  const questions = await generateQuizQuestions({
    chunks,
    numQuestions: n,
    syllabusName: syllabus.name,
    className,
    subjectName: subject.name,
    grade: classLevel.grade,
  });

  res.json(new ApiResponse(200, 'Quiz generated successfully', {
    questions,
    meta: {
      syllabusName:   syllabus.name,
      className,
      subjectName:    subject.name,
      chapterTitles:  chapters.map((c) => `Ch. ${c.chapterNumber}: ${c.title}`),
      chapterNumbers: chapters.map((c) => c.chapterNumber),
      numQuestions:   questions.length,
    },
  }));
});

/* ── POST /api/v1/quiz/submit ───────────────────────────────────────────────── */
const submitQuiz = asyncHandler(async (req, res) => {
  const { syllabusId, classLevelId, subjectId, chapterIds, answers, timeTakenSeconds, meta } = req.body;

  if (!Array.isArray(answers) || !answers.length) throw new ApiError(400, 'answers[] are required');

  const score      = answers.filter((a) => a.isCorrect).length;
  const percentage = Math.round((score / answers.length) * 100);
  const { weakTopics, strongTopics } = analyzeAnswers(answers);

  const result = await QuizResult.create({
    customer:         req.user.id,
    syllabus:         syllabusId,
    classLevel:       classLevelId,
    subject:          subjectId,
    chapters:         chapterIds || [],
    meta:             meta || {},
    numQuestions:     answers.length,
    score,
    percentage,
    timeTakenSeconds: timeTakenSeconds || 0,
    answers,
    weakTopics,
    strongTopics,
  });

  res.status(201).json(new ApiResponse(201, 'Quiz result saved', {
    resultId: result._id,
    score,
    percentage,
    weakTopics,
    strongTopics,
  }));
});

/* ── GET /api/v1/quiz/history ───────────────────────────────────────────────── */
const getHistory = asyncHandler(async (req, res) => {
  const results = await QuizResult.find({ customer: req.user.id })
    .select('meta score percentage numQuestions timeTakenSeconds completedAt weakTopics strongTopics')
    .sort({ completedAt: -1 })
    .limit(20);

  res.json(new ApiResponse(200, 'Quiz history fetched', results));
});

module.exports = { generateQuiz, submitQuiz, getHistory };
