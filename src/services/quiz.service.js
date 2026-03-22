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
// Question style variants — rotated randomly so each attempt has a different flavour
const QUESTION_STYLES = [
  'Focus on definitions and meanings of key terms.',
  'Focus on processes, sequences, and how things work step by step.',
  'Focus on comparisons and differences between concepts.',
  'Focus on cause-and-effect relationships.',
  'Focus on real-life applications and examples of the concepts.',
  'Focus on facts, figures, and specific details from the content.',
  'Mix all question types: definitions, processes, comparisons, and applications.',
];

const generateQuizQuestions = async ({ chunks, numQuestions, syllabusName, className, subjectName }) => {
  if (!process.env.CLAUDE_API_KEY) throw new Error('CLAUDE_API_KEY not configured');

  const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

  // Chunks are already randomly shuffled by the controller — take the first N
  const contextText = chunks
    .slice(0, MAX_CONTEXT_CHUNKS)
    .map((c, i) => `[Section ${i + 1}]\n${c.content}`)
    .join('\n\n---\n\n');

  // Pick a random style and a random seed to push Claude toward variety
  const style = QUESTION_STYLES[Math.floor(Math.random() * QUESTION_STYLES.length)];
  const seed  = Math.floor(Math.random() * 99999);

  const systemPrompt = `You generate quiz questions as a strict JSON array. You MUST return ONLY the raw JSON array — no markdown, no code blocks, no explanation. Just the JSON.`;

  const userPrompt = `Create exactly ${numQuestions} UNIQUE multiple choice questions for a ${syllabusName} ${className} ${subjectName} quiz.

STYLE FOR THIS ATTEMPT (variation ${seed}): ${style}

RULES:
- Base questions ONLY on the textbook content provided below
- Each question must have exactly 4 options
- No two questions should test the same fact or sentence
- Vary how questions are phrased: use "Which of the following…", "What is…", "Why does…", "How does…", etc.
- Mix difficulty: ~30% easy, ~50% medium, ~20% hard
- "topic" field: 2-4 word topic name (e.g. "Cell Division")
- "correct" field: 0-based index of the correct option
- Shuffle the position of the correct answer across questions (don't always put it at index 0)

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
