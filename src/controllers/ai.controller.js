const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');
const Syllabus = require('../models/Syllabus.model');
const ClassLevel = require('../models/ClassLevel.model');
const Subject = require('../models/Subject.model');
const ChapterChunk = require('../models/ChapterChunk.model');
const { chatWithTextbook, deepDiveStep } = require('../services/claude.service');

/**
 * POST /api/v1/ai/chat
 * Customer: ask a free-form question about their textbook
 */
const chatWithAI = asyncHandler(async (req, res) => {
  const { syllabusId, classLevelId, subjectId, message, history = [] } = req.body;

  if (!syllabusId || !classLevelId || !subjectId) {
    throw new ApiError(400, 'syllabusId, classLevelId, and subjectId are required');
  }
  if (!message || !message.trim()) {
    throw new ApiError(400, 'message is required');
  }

  const [syllabus, classLevel, subject] = await Promise.all([
    Syllabus.findById(syllabusId).select('name'),
    ClassLevel.findById(classLevelId).select('name grade'),
    Subject.findById(subjectId).select('name'),
  ]);

  if (!syllabus || !classLevel || !subject) {
    throw new ApiError(404, 'Invalid syllabus, class, or subject selection');
  }

  const result = await chatWithTextbook({
    message: message.trim(),
    history,
    syllabusId,
    classLevelId,
    subjectId,
    syllabusName: syllabus.name,
    className: `${classLevel.name}${classLevel.grade ? ` (Grade ${classLevel.grade})` : ''}`,
    subjectName: subject.name,
  });

  res.json(new ApiResponse(200, 'AI response generated', result));
});

/**
 * POST /api/v1/ai/deep-dive
 * Customer: guided learning step for a specific topic
 *
 * Body:
 *   syllabusId, classLevelId, subjectId  — selection context
 *   topic   — the topic name to dive into (e.g. "Mitochondria")
 *   step    — 'explain' | 'examples' | 'quiz' | 'next'
 */
const deepDive = asyncHandler(async (req, res) => {
  const { syllabusId, classLevelId, subjectId, topic, step } = req.body;

  if (!syllabusId || !classLevelId || !subjectId || !topic || !step) {
    throw new ApiError(400, 'syllabusId, classLevelId, subjectId, topic, and step are required');
  }

  const validSteps = ['explain', 'examples', 'quiz', 'next'];
  if (!validSteps.includes(step)) {
    throw new ApiError(400, `step must be one of: ${validSteps.join(', ')}`);
  }

  const [syllabus, classLevel, subject] = await Promise.all([
    Syllabus.findById(syllabusId).select('name'),
    ClassLevel.findById(classLevelId).select('name grade'),
    Subject.findById(subjectId).select('name'),
  ]);

  if (!syllabus || !classLevel || !subject) {
    throw new ApiError(404, 'Invalid syllabus, class, or subject selection');
  }

  // Fetch relevant textbook chunks for context (skip for quiz — JSON output only)
  let contextChunks = [];
  if (step !== 'quiz') {
    const words = topic.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter((w) => w.length > 2);
    if (words.length > 0) {
      contextChunks = await ChapterChunk.find({
        syllabus: syllabusId,
        classLevel: classLevelId,
        subject: subjectId,
        content: { $regex: words.join('|'), $options: 'i' },
      })
        .select('content pageNumber')
        .limit(4);
    }
  }

  const rawText = await deepDiveStep({
    topic,
    step,
    syllabusName: syllabus.name,
    className: `${classLevel.name}${classLevel.grade ? ` (Grade ${classLevel.grade})` : ''}`,
    subjectName: subject.name,
    contextChunks,
  });

  // Quiz step: parse JSON from response
  if (step === 'quiz') {
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new ApiError(500, 'Failed to generate quiz questions — please try again');
    }
    try {
      const questions = JSON.parse(jsonMatch[0]);
      return res.json(new ApiResponse(200, 'Quiz generated', { step, questions }));
    } catch {
      throw new ApiError(500, 'Quiz response could not be parsed — please try again');
    }
  }

  res.json(new ApiResponse(200, 'Deep dive content generated', { step, reply: rawText }));
});

module.exports = { chatWithAI, deepDive };
