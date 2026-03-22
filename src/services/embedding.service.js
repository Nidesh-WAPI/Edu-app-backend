/**
 * Embedding Service — Google Gemini (via @google/generative-ai SDK)
 *
 * Model  : gemini-embedding-001  (768 dimensions)
 * Set GEMINI_API_KEY in .env to enable embeddings.
 *
 * If no key is set, chunks are saved WITHOUT embeddings and can be
 * re-processed later by calling POST /api/v1/chapters/:id/embed
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

const EMBEDDING_MODEL = 'gemini-embedding-001';

const getClient = () => {
  if (!process.env.GEMINI_API_KEY) return null;
  return new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
};

const isEnabled = () => !!process.env.GEMINI_API_KEY;

/**
 * Generate embeddings for an array of text strings.
 * Returns array of float arrays (or null per item if no API key).
 */
const generateEmbeddings = async (texts) => {
  if (!isEnabled()) {
    console.log('[Embedding] GEMINI_API_KEY not set — skipping embeddings');
    return texts.map(() => null);
  }

  const genAI = getClient();
  const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });

  const embeddings = [];

  for (const text of texts) {
    const result = await model.embedContent(text);
    embeddings.push(result.embedding.values);
  }

  return embeddings;
};

module.exports = { generateEmbeddings, isEnabled, EMBEDDING_MODEL };
