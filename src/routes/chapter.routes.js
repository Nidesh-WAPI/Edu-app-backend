const express = require('express');
const { verifyToken, requireRole } = require('../middleware/auth.middleware');
const { uploadPdf } = require('../middleware/upload.middleware');
const {
  getChapters,
  getChapter,
  analyzeChapter,
  confirmChapterUpload,
  embedChapter,
  deleteChapter,
} = require('../controllers/chapter.controller');

const router = express.Router();
router.use(verifyToken, requireRole('admin'));

const handleUpload = (req, res, next) => {
  uploadPdf(req, res, (err) => {
    if (err) return next(err);
    next();
  });
};

router.get('/', getChapters);
router.get('/:id', getChapter);
router.post('/:id/embed', embedChapter);
router.delete('/:id', deleteChapter);

// 2-step upload flow
router.post('/analyze', handleUpload, analyzeChapter);   // Step 1 — analyze PDF, detect page numbers
router.post('/confirm', confirmChapterUpload);            // Step 2 — confirm page mapping, save chapter

module.exports = router;
