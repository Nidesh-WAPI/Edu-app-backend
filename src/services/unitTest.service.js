/**
 * Unit Test Service
 *
 * generateUnitTestPaper — Claude claude-haiku-4-5 generates sections JSON (model answers stored only).
 *   paperText is built server-side from the parsed sections — avoids JSON parse failures from
 *   Claude writing literal newlines inside JSON string values.
 *
 * evaluateAnswerSheet — Claude claude-sonnet-4-5 Vision reads answer sheet image(s)
 *   Returns evaluation JSON with per-question marks + overall feedback.
 */

const fs   = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const PAPER_MODEL = 'claude-haiku-4-5';
const EVAL_MODEL  = 'claude-sonnet-4-5';

// ── Build formatted paper text from sections (server-side, no JSON issues) ────

const buildPaperText = ({ syllabusName, className, subjectName, chapterTitles, maxMarks, sections }) => {
  const lines = [];
  lines.push('='.repeat(60));
  lines.push(`${syllabusName.toUpperCase()} — UNIT TEST`);
  lines.push('='.repeat(60));
  lines.push(`Subject    : ${subjectName}`);
  lines.push(`Class      : ${className}`);
  lines.push(`Max Marks  : ${maxMarks}`);
  lines.push(`Time       : 2 Hours`);
  lines.push(`Chapters   : ${chapterTitles.join(', ')}`);
  lines.push('='.repeat(60));
  lines.push('');
  lines.push('General Instructions:');
  lines.push('1. All questions are compulsory.');
  lines.push('2. Write clearly and legibly.');
  lines.push('3. Start each section on a new page.');
  lines.push('');

  sections.forEach((sec) => {
    lines.push('-'.repeat(60));
    lines.push(`${sec.name}  [Total: ${sec.totalMarks} Marks]`);
    lines.push('-'.repeat(60));
    lines.push('');

    sec.questions.forEach((q) => {
      if (sec.type === 'mcq') {
        lines.push(`${q.number}. ${q.question}  [${q.marksPerQuestion} mark]`);
        (q.options || []).forEach((opt) => lines.push(`   ${opt}`));
      } else {
        lines.push(`${q.number}. ${q.question}  [${q.marksPerQuestion} marks]`);
      }
      lines.push('');
    });
  });

  lines.push('='.repeat(60));
  lines.push('*** END OF QUESTION PAPER ***');
  lines.push('='.repeat(60));

  return lines.join('\n');
};

// ── Safe JSON extraction from Claude response ─────────────────────────────────

const extractJson = (raw) => {
  // Strip markdown code fences if Claude added them
  let cleaned = raw
    .replace(/^```(?:json)?\s*/im, '')
    .replace(/```\s*$/im, '')
    .trim();

  // Extract outermost JSON object
  const start = cleaned.indexOf('{');
  const end   = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;

  const candidate = cleaned.slice(start, end + 1);

  // Attempt 1: parse as-is
  try { return JSON.parse(candidate); } catch { /* fall through */ }

  // Attempt 2: escape unescaped newlines/tabs inside JSON strings
  try {
    const fixed = candidate.replace(
      /"((?:[^"\\]|\\.)*)"/gs,
      (_, inner) => `"${inner.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')}"`
    );
    return JSON.parse(fixed);
  } catch { /* fall through */ }

  return null;
};

// ── Paper Generation ──────────────────────────────────────────────────────────

const generateUnitTestPaper = async ({
  syllabusName,
  className,
  subjectName,
  chapterTitles,
  maxMarks,
  contextChunks = [],
}) => {
  if (!process.env.CLAUDE_API_KEY) {
    throw new Error('CLAUDE_API_KEY is not configured.');
  }

  // Mark distribution
  const sectionAMarks = Math.round(maxMarks * 0.20); // MCQ   — 20%
  const sectionBMarks = Math.round(maxMarks * 0.35); // Short — 35%
  const sectionCMarks = maxMarks - sectionAMarks - sectionBMarks; // Long — 45%

  const mcqCount   = 10;
  const shortCount = 5;
  const longCount  = 3;

  const mcqPerQ   = parseFloat((sectionAMarks / mcqCount).toFixed(1));
  const shortPerQ = parseFloat((sectionBMarks / shortCount).toFixed(1));
  const longPerQ  = parseFloat((sectionCMarks / longCount).toFixed(1));

  let contextStr = '';
  if (contextChunks.length > 0) {
    contextStr =
      '\n\nCHAPTER CONTENT — base your questions on this:\n' +
      contextChunks.map((c, i) => `[${i + 1}] ${c.content}`).join('\n\n');
  }

  // NOTE: We intentionally do NOT ask Claude for paperText.
  // paperText is constructed server-side from the parsed sections JSON.
  const prompt = `Generate unit test questions for:

SYLLABUS : ${syllabusName}
CLASS    : ${className}
SUBJECT  : ${subjectName}
CHAPTERS : ${chapterTitles.join(', ')}
${contextStr}

Return ONLY a raw JSON object (NO markdown, NO code fences, NO explanation).
Use only simple ASCII inside all string values — do NOT use actual newline or tab characters inside strings.
Use the EXACT structure below:

{
  "sections": [
    {
      "name": "Section A - Multiple Choice Questions",
      "type": "mcq",
      "totalMarks": ${sectionAMarks},
      "questions": [
        {
          "number": 1,
          "question": "Question text here?",
          "options": ["A. option one", "B. option two", "C. option three", "D. option four"],
          "modelAnswer": "A",
          "marksPerQuestion": ${mcqPerQ},
          "keyPoints": ["reason the answer is correct"]
        }
      ]
    },
    {
      "name": "Section B - Short Answer Questions",
      "type": "short",
      "totalMarks": ${sectionBMarks},
      "questions": [
        {
          "number": 1,
          "question": "Question text here?",
          "modelAnswer": "Complete model answer in 3 to 5 sentences.",
          "marksPerQuestion": ${shortPerQ},
          "keyPoints": ["key point one", "key point two", "key point three"]
        }
      ]
    },
    {
      "name": "Section C - Long Answer Questions",
      "type": "long",
      "totalMarks": ${sectionCMarks},
      "questions": [
        {
          "number": 1,
          "question": "Question text here?",
          "modelAnswer": "Detailed model answer.",
          "marksPerQuestion": ${longPerQ},
          "keyPoints": ["key point one", "key point two", "key point three", "key point four", "key point five"]
        }
      ]
    }
  ]
}

Section A must have exactly ${mcqCount} questions.
Section B must have exactly ${shortCount} questions.
Section C must have exactly ${longCount} questions.`;

  const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

  const response = await client.messages.create({
    model:      PAPER_MODEL,
    max_tokens: 4096,
    messages:   [{ role: 'user', content: prompt }],
  });

  const raw = response.content[0]?.text || '';
  const parsed = extractJson(raw);

  if (!parsed || !Array.isArray(parsed.sections) || parsed.sections.length === 0) {
    throw new Error('Failed to generate question paper — invalid AI response. Please try again.');
  }

  // Build formatted paper text server-side (reliable, no JSON encoding issues)
  const paperText = buildPaperText({
    syllabusName,
    className,
    subjectName,
    chapterTitles,
    maxMarks,
    sections: parsed.sections,
  });

  return { paperText, sections: parsed.sections };
};

// ── Answer Sheet Evaluation ───────────────────────────────────────────────────

const MEDIA_TYPES = {
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png':  'image/png',
  '.webp': 'image/webp',
};

const evaluateAnswerSheet = async ({ paper, imageFiles }) => {
  if (!process.env.CLAUDE_API_KEY) {
    throw new Error('CLAUDE_API_KEY is not configured.');
  }
  if (!imageFiles || imageFiles.length === 0) {
    throw new Error('No answer sheet images provided.');
  }

  // Build marking scheme text (confidential)
  const markingScheme = paper.sections
    .map((sec) => {
      const qLines = sec.questions
        .map((q) => {
          let line = `Q${q.number}. ${q.question} [${q.marksPerQuestion} marks]`;
          if (q.options) line += ` | Options: ${q.options.join(' / ')}`;
          line += ` | Model Answer: ${q.modelAnswer}`;
          line += ` | Key Points: ${q.keyPoints.join('; ')}`;
          return line;
        })
        .join('\n');
      return `${sec.name} (Total: ${sec.totalMarks} marks)\n${qLines}`;
    })
    .join('\n\n');

  // Build section template for expected JSON output
  const sectionTemplate = paper.sections.map((sec) => ({
    name:          sec.name,
    type:          sec.type,
    totalMarks:    sec.totalMarks,
    marksObtained: 0,
    questions:     sec.questions.map((q) => ({
      number:        q.number,
      studentAnswer: 'Not attempted',
      marksAwarded:  0,
      maxMarks:      q.marksPerQuestion,
      feedback:      '',
    })),
  }));

  // Prepare images for Claude Vision
  const imageContents = imageFiles.map((f) => {
    const ext       = path.extname(f.path).toLowerCase();
    const mediaType = MEDIA_TYPES[ext] || 'image/jpeg';
    const base64    = fs.readFileSync(f.path, { encoding: 'base64' });
    return { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } };
  });

  const systemText = `You are an experienced teacher evaluating a student's handwritten answer sheet.

QUESTION PAPER:
${paper.paperText}

MARKING SCHEME (Confidential):
${markingScheme}

MAX MARKS: ${paper.maxMarks}

The student's answer sheet is attached as ${imageFiles.length} image(s). Read every visible answer carefully.

Scoring rules:
- MCQ (Section A): Full marks if letter matches model answer; 0 otherwise.
- Short Answer (Section B): Award proportionally based on key points covered.
- Long Answer (Section C): Award based on depth, accuracy, and key point coverage.

Return ONLY a raw JSON object (NO markdown, NO code fences). Use only simple ASCII in strings — no actual newlines inside string values:
${JSON.stringify({ sections: sectionTemplate, totalMarksObtained: 0, maxMarks: paper.maxMarks, percentage: 0, overallFeedback: '', strengths: [], improvements: [] })}`;

  const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

  const response = await client.messages.create({
    model:      EVAL_MODEL,
    max_tokens: 4096,
    messages: [
      {
        role:    'user',
        content: [
          { type: 'text', text: systemText },
          ...imageContents,
          { type: 'text', text: 'Evaluate all answers visible in the image(s) and return the JSON evaluation.' },
        ],
      },
    ],
  });

  const raw = response.content[0]?.text || '';
  const result = extractJson(raw);

  if (!result) {
    throw new Error('Evaluation response was invalid — please try again.');
  }

  // Recalculate totals to ensure consistency
  let totalObtained = 0;
  (result.sections || []).forEach((sec) => {
    let secTotal = 0;
    (sec.questions || []).forEach((q) => { secTotal += Number(q.marksAwarded) || 0; });
    sec.marksObtained = secTotal;
    totalObtained += secTotal;
  });

  result.totalMarksObtained = totalObtained;
  result.maxMarks            = paper.maxMarks;
  result.percentage          = Math.round((totalObtained / paper.maxMarks) * 100);

  return result;
};

module.exports = { generateUnitTestPaper, evaluateAnswerSheet };
