/**
 * Quiz Service — generates MCQ questions using Claude AI
 * from uploaded textbook chunk content.
 */
const Anthropic = require('@anthropic-ai/sdk');

const CLAUDE_MODEL  = 'claude-haiku-4-5';
const MIN_QUESTIONS = 5;
const MAX_QUESTIONS = 30;
const MAX_CONTEXT_CHUNKS = 25;

/**
 * Generate quiz MCQ questions from textbook chunks.
 * Returns array of { question, options, correct, explanation, difficulty, topic }
 */
const generateQuizQuestions = async ({ chunks, numQuestions, syllabusName, className, subjectName }) => {
  if (!process.env.CLAUDE_API_KEY) throw new Error('CLAUDE_API_KEY not configured');

  const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

  const contextText = chunks
    .slice(0, MAX_CONTEXT_CHUNKS)
    .map((c, i) => `[Section ${i + 1}]\n${c.content}`)
    .join('\n\n---\n\n');

  const systemPrompt = `You generate quiz questions as a strict JSON array. You MUST return ONLY the raw JSON array — no markdown, no code blocks, no explanation. Just the JSON.`;

  const userPrompt = `Create exactly ${numQuestions} multiple choice questions for a ${syllabusName} ${className} ${subjectName} chapter quiz.

RULES:
- Base questions ONLY on the textbook content below
- Each question has exactly 4 options
- Mix: ~30% easy, ~50% medium, ~20% hard
- "topic" field: 2-4 word topic name (e.g. "Cell Division")
- "correct" field: 0-based index of the correct option

Return ONLY this JSON array (absolutely no other text):
[
  {
    "question": "Question text here?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct": 0,
    "explanation": "Brief explanation of why this is correct.",
    "difficulty": "easy",
    "topic": "Topic Name"
  }
]

TEXTBOOK CONTENT:
${contextText}`;

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 8000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const raw = response.content[0]?.text || '';
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('AI did not return a valid question list. Please try again.');

  const questions = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error('No questions were generated. Please try again.');
  }

  return questions.slice(0, numQuestions);
};

/**
 * Analyse submitted answers → derive weak and strong topics.
 */
const analyzeAnswers = (answers) => {
  const stats = {};
  for (const a of answers) {
    const t = (a.topic || 'General').trim();
    if (!stats[t]) stats[t] = { correct: 0, total: 0 };
    stats[t].total++;
    if (a.isCorrect) stats[t].correct++;
  }

  const weakTopics   = [];
  const strongTopics = [];
  for (const [topic, s] of Object.entries(stats)) {
    const pct = s.correct / s.total;
    if (pct < 0.5)  weakTopics.push(topic);
    else if (pct >= 0.8) strongTopics.push(topic);
  }
  return { weakTopics, strongTopics };
};

module.exports = { generateQuizQuestions, analyzeAnswers, MIN_QUESTIONS, MAX_QUESTIONS };
