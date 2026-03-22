/**
 * Claude AI Teacher Service
 *
 * Uses Claude claude-haiku-4-5 as an AI textbook teacher.
 * Retrieves relevant textbook chunks from MongoDB and sends them
 * as context so Claude only answers from the actual textbook content.
 */

const Anthropic = require('@anthropic-ai/sdk');
const ChapterChunk = require('../models/ChapterChunk.model');
const { generateEmbeddings, isEnabled: embeddingEnabled } = require('./embedding.service');

const CLAUDE_MODEL = 'claude-haiku-4-5';
const MAX_CONTEXT_CHUNKS = 8;
const MAX_HISTORY_TURNS = 10; // last N conversation turns to keep

// ── Grade tier detection ──────────────────────────────────────────────────────
const getGradeTier = (grade) => {
  const g = parseInt(grade, 10);
  if (!isNaN(g) && g >= 1 && g <= 3) return 'kids';
  if (!isNaN(g) && g >= 4 && g <= 7) return 'intermediate';
  return 'standard';
};

const buildTeachingStyle = (grade) => {
  const tier = getGradeTier(grade);
  if (tier === 'kids') return `YOUR TEACHING STYLE (Young Learner 🌟):
• Use VERY simple words — explain like talking to a 6–8 year old
• Write SHORT sentences — maximum 8–10 words each
• Add fun emojis to every key point 🌱🐛🦋🎉
• Use fun comparisons the child already knows ("like building blocks", "like your tummy", "like a toy box")
• Be VERY warm, cheerful and encouraging — celebrate every question! 🎊
• Explain only ONE idea at a time — no long lists
• End with a fun "Did you know? 🤔" fact
• Use "you" and speak directly and warmly to the child`;

  if (tier === 'intermediate') return `YOUR TEACHING STYLE:
• Explain clearly using simple, everyday language
• Use emojis to highlight key ideas ✨
• Give relatable real-life examples students can connect to
• Build from simple → complex step by step
• Be encouraging and positive 🎯`;

  return `YOUR TEACHING STYLE:
• Explain concepts clearly and precisely
• Use bullet points, numbered steps, or tables when it helps clarity
• Give real-world examples to make abstract concepts concrete
• Be encouraging and positive — students learn better when motivated
• For formulas or definitions, highlight them clearly
• Suggest follow-up topics or questions to deepen understanding`;
};

// ── Build the system prompt ───────────────────────────────────────────────────
const buildSystemPrompt = (syllabusName, className, subjectName, contextChunks, totalChunksInSubject, grade) => {
  const hasAnyContent = totalChunksInSubject > 0;
  const hasRelevantContext = contextChunks.length > 0;
  const teachingStyle = buildTeachingStyle(grade);

  // ── Case 1: Relevant chunks found → strict textbook mode ──────────────────
  if (hasRelevantContext) {
    const context = contextChunks
      .map((c, i) => {
        const pageInfo = c.pageNumber
          ? ` (Page ${c.pageNumber})`
          : c.pdfPageIndex
          ? ` (PDF page ${c.pdfPageIndex})`
          : '';
        return `[${i + 1}]${pageInfo}\n${c.content}`;
      })
      .join('\n\n---\n\n');

    return `You are an expert, friendly teacher for the following textbook:

SYLLABUS : ${syllabusName}
CLASS    : ${className}
SUBJECT  : ${subjectName}

${teachingStyle}

STRICT RULES:
1. Answer ONLY using the TEXTBOOK CONTENT provided below — do not use outside knowledge
2. If the student's question is not covered by the content below, say:
   "That specific topic isn't in the section I have loaded right now. Try rephrasing or ask about another topic from your ${subjectName} textbook!"
3. Never invent facts, formulas, or examples not present in the content
4. Always cite the page number when available, e.g. "As explained on Page 12..."
5. You ARE the teacher — guide, explain, summarise, give examples, create practice questions from the content

--- TEXTBOOK CONTENT (${syllabusName} · ${className} · ${subjectName}) ---

${context}

--- END OF TEXTBOOK CONTENT ---

Now help the student understand the above content as their personal AI teacher.`;
  }

  // ── Case 2: Subject has content in DB but no match for this query ─────────
  if (hasAnyContent) {
    return `You are an expert, friendly teacher for the following textbook:

SYLLABUS : ${syllabusName}
CLASS    : ${className}
SUBJECT  : ${subjectName}

${teachingStyle}

IMPORTANT: The student's question did not closely match any specific section of the uploaded textbook content.
- Do NOT ask the student which textbook they are using — you already know it (${syllabusName} ${className} ${subjectName})
- Politely let the student know you couldn't find an exact match for their question in the uploaded chapters
- Suggest they rephrase their question with a specific topic name or keyword (e.g. "photosynthesis", "chapter 3 notes", "cell division")
- You may give a brief general direction about the topic if it clearly belongs to ${subjectName} for ${className}
- Keep your response short and helpful`;
  }

  // ── Case 3: No content uploaded at all for this subject ───────────────────
  return `You are an expert, friendly teacher for the following textbook:

SYLLABUS : ${syllabusName}
CLASS    : ${className}
SUBJECT  : ${subjectName}

${teachingStyle}

IMPORTANT: The textbook content for ${syllabusName} ${className} ${subjectName} has NOT been uploaded yet.
- Do NOT ask the student which textbook they are using — you already know it
- Warmly inform the student that the ${subjectName} textbook chapters haven't been uploaded to the system yet
- Encourage them to ask their teacher or admin to upload the PDF chapters
- You may give a short encouraging message about the subject
- Do NOT answer syllabus/chapter questions from your own knowledge — stay within your role as their textbook AI teacher`;
};

// ── Retrieve relevant chunks from MongoDB ─────────────────────────────────────
// Returns { chunks, totalInSubject }
const getRelevantChunks = async (query, syllabusId, classLevelId, subjectId) => {
  const baseFilter = { syllabus: syllabusId, classLevel: classLevelId, subject: subjectId };

  // Always get total count so we know if ANY content was uploaded for this subject
  const totalInSubject = await ChapterChunk.countDocuments(baseFilter);

  if (totalInSubject === 0) {
    return { chunks: [], totalInSubject: 0 };
  }

  // 1. Try vector search if embeddings are available
  if (embeddingEnabled()) {
    try {
      const [queryEmbedding] = await generateEmbeddings([query]);

      const results = await ChapterChunk.aggregate([
        {
          $vectorSearch: {
            index: 'chunk_vector_index',
            path: 'embedding',
            queryVector: queryEmbedding,
            numCandidates: 50,
            limit: MAX_CONTEXT_CHUNKS,
            filter: baseFilter,
          },
        },
        { $project: { content: 1, pageNumber: 1, pdfPageIndex: 1, score: { $meta: 'vectorSearchScore' } } },
      ]);

      if (results.length > 0) return { chunks: results, totalInSubject };
    } catch (err) {
      console.log('[AI] Vector search not available, falling back to text search:', err.message);
    }
  }

  // 2. Fallback: keyword text search — match any meaningful word
  const words = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 5);

  if (words.length > 0) {
    const textResults = await ChapterChunk.find({
      ...baseFilter,
      content: { $regex: words.join('|'), $options: 'i' },
    })
      .select('content pageNumber pdfPageIndex')
      .limit(MAX_CONTEXT_CHUNKS);

    if (textResults.length > 0) return { chunks: textResults, totalInSubject };
  }

  // 3. Last resort: return first N chunks ordered by chapter position
  const fallback = await ChapterChunk.find(baseFilter)
    .select('content pageNumber pdfPageIndex')
    .sort({ chunkIndex: 1 })
    .limit(MAX_CONTEXT_CHUNKS);

  return { chunks: fallback, totalInSubject };
};

// ── Main chat function ────────────────────────────────────────────────────────
const chatWithTextbook = async ({
  message,
  history = [],
  syllabusId,
  classLevelId,
  subjectId,
  syllabusName,
  className,
  subjectName,
  grade,
}) => {
  if (!process.env.CLAUDE_API_KEY) {
    throw new Error('CLAUDE_API_KEY is not configured. Please add it to the .env file.');
  }

  const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

  // Get relevant textbook content for this query
  const { chunks, totalInSubject } = await getRelevantChunks(message, syllabusId, classLevelId, subjectId);

  console.log(`[AI] Subject total chunks: ${totalInSubject} | Query matched chunks: ${chunks.length}`);

  // Build conversation history (trim to last N turns)
  const recentHistory = history.slice(-MAX_HISTORY_TURNS * 2); // each turn = 2 messages
  const messages = [
    ...recentHistory.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: message },
  ];

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1500,
    system: buildSystemPrompt(syllabusName, className, subjectName, chunks, totalInSubject, grade),
    messages,
  });

  const replyText = response.content[0]?.text || 'I could not generate a response. Please try again.';

  return {
    reply: replyText,
    chunksUsed: chunks.length,
    totalChunksInSubject: totalInSubject,
    model: CLAUDE_MODEL,
  };
};

// ── Deep Dive step prompts ────────────────────────────────────────────────────
const DEEP_DIVE_STEPS = ['explain', 'examples', 'quiz', 'next'];

const buildDeepDivePrompt = (step, topic, syllabusName, className, subjectName, grade) => {
  const tier = getGradeTier(grade);
  const isKids = tier === 'kids';

  const base = isKids
    ? `You are a super fun, friendly teacher for ${syllabusName} ${className} ${subjectName}. 🌟 The student is a young child learning about: "${topic}". Use very simple words, short sentences, and lots of emojis!`
    : `You are an expert, encouraging teacher for ${syllabusName} ${className} ${subjectName}. The student is learning about: "${topic}".`;

  switch (step) {
    case 'explain':
      return {
        system: base,
        user: isKids
          ? `Explain "${topic}" in a very fun, simple way for a young child! Include:
- What it is (1 simple sentence with an emoji 🌟)
- Why it is cool or important (1–2 sentences)
- A fun comparison they know ("It's like...")
- 2–3 key things to remember (very short, with emojis)

Use ## headings. Keep every sentence very short and fun! 🎉`
          : `Explain "${topic}" in a clear, student-friendly way. Include:
- A simple definition (1-2 sentences)
- Why it matters / its importance
- A relatable analogy or comparison
- Key points to remember

Use ## headings to structure each section. Keep language simple and encouraging.`,
      };

    case 'examples':
      return {
        system: base,
        user: isKids
          ? `Give exactly 3 fun, easy examples of "${topic}" that a young child can understand! 🎈

Format each like this:
**Example 1: [Fun Title] [emoji]**
[1–2 very short, simple sentences. Use words a 6-year-old knows!]

Make it super fun and easy to picture! 🌈`
          : `Give exactly 3 real-world examples of "${topic}" that a student can easily relate to.

Format each as:
**Example 1: [Descriptive Title]**
[2-3 sentences explaining how this example demonstrates the concept]

Make the examples vivid and memorable.`,
      };

    case 'quiz':
      return {
        system: `You are a teacher creating a quiz. You MUST return ONLY a valid JSON array — no markdown, no explanation, no code blocks, just the raw JSON array.`,
        user: isKids
          ? `Create exactly 3 very simple, fun multiple choice questions about "${topic}" for a young child in ${subjectName}. Use very simple words. Make it feel like a game! 🎮

Return ONLY this JSON array (no other text):
[
  {
    "question": "Short, simple question? 🌟",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct": 0,
    "explanation": "Short, cheerful reason why this is correct! 🎉"
  }
]`
          : `Create exactly 3 multiple choice questions to test a student's understanding of "${topic}" from ${subjectName}.

Return ONLY this JSON array (no other text whatsoever):
[
  {
    "question": "Question text here?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct": 0,
    "explanation": "Brief reason why this answer is correct."
  }
]`,
      };

    case 'next':
      return {
        system: base,
        user: isKids
          ? `The child just learned about "${topic}" in ${subjectName}! 🎉 Suggest 4 fun topics to explore next.

Format exactly as:
1. **[Topic Name]** 🌟 — [One very simple sentence — what fun thing they will discover!]
2. **[Topic Name]** 🌿 — [One very simple sentence]
3. **[Topic Name]** 🔍 — [One very simple sentence]
4. **[Topic Name]** 💡 — [One very simple sentence]`
          : `The student just finished learning "${topic}" in ${subjectName}. Suggest 4 related topics to explore next.

Format exactly as:
1. **[Topic Name]** — [One sentence describing what they'll discover]
2. **[Topic Name]** — [One sentence describing what they'll discover]
3. **[Topic Name]** — [One sentence describing what they'll discover]
4. **[Topic Name]** — [One sentence describing what they'll discover]

Make topics specific, directly related to "${topic}", and part of ${subjectName}.`,
      };

    default:
      throw new Error(`Unknown deep dive step: ${step}`);
  }
};

/**
 * Generate deep dive content for a specific topic and learning step.
 * Returns raw Claude text (quiz step returns parseable JSON string).
 */
const deepDiveStep = async ({ topic, step, syllabusName, className, subjectName, contextChunks = [], grade }) => {
  if (!process.env.CLAUDE_API_KEY) {
    throw new Error('CLAUDE_API_KEY is not configured.');
  }
  if (!DEEP_DIVE_STEPS.includes(step)) {
    throw new Error(`step must be one of: ${DEEP_DIVE_STEPS.join(', ')}`);
  }

  const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
  const { system, user } = buildDeepDivePrompt(step, topic, syllabusName, className, subjectName, grade);

  // Prepend relevant textbook context if available
  let systemWithContext = system;
  if (contextChunks.length > 0 && step !== 'quiz') {
    const ctx = contextChunks.map((c, i) => `[${i + 1}] ${c.content}`).join('\n\n');
    systemWithContext = `${system}\n\nRELEVANT TEXTBOOK CONTENT:\n${ctx}\n\nBase your response on this content where applicable.`;
  }

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: step === 'quiz' ? 1024 : 1200,
    system: systemWithContext,
    messages: [{ role: 'user', content: user }],
  });

  return response.content[0]?.text || '';
};

module.exports = { chatWithTextbook, deepDiveStep };
