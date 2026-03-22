const express = require('express');
const authRoutes         = require('./auth.routes');
const configRoutes       = require('./config.routes');
const chapterRoutes      = require('./chapter.routes');
const customerAuthRoutes = require('./customer.auth.routes');
const aiRoutes           = require('./ai.routes');
const publicRoutes       = require('./public.routes');
const quizRoutes         = require('./quiz.routes');
const unitTestRoutes     = require('./unitTest.routes');

const router = express.Router();

// ── Admin ─────────────────────────────────────────────────────────────────────
router.use('/auth',     authRoutes);
router.use('/config',   configRoutes);
router.use('/chapters', chapterRoutes);

// ── Customer ──────────────────────────────────────────────────────────────────
router.use('/customer/auth', customerAuthRoutes);
router.use('/ai',            aiRoutes);
router.use('/quiz',          quizRoutes);
router.use('/unit-test',     unitTestRoutes);

// ── Public (no auth) ──────────────────────────────────────────────────────────
router.use('/public', publicRoutes);

module.exports = router;
