const express = require('express');
const { verifyCustomerToken }               = require('../middleware/auth.middleware');
const { uploadAnswerSheets }                = require('../middleware/upload.middleware');
const { generatePaper, getMyPapers, deletePaper, evaluatePaper, getResult } =
  require('../controllers/unitTest.controller');

const router = express.Router();

// All routes require customer authentication
router.post('/generate',             verifyCustomerToken, generatePaper);
router.get('/papers',                verifyCustomerToken, getMyPapers);
router.delete('/papers/:id',         verifyCustomerToken, deletePaper);
router.post('/papers/:id/evaluate',  verifyCustomerToken, uploadAnswerSheets, evaluatePaper);
router.get('/papers/:id/result',     verifyCustomerToken, getResult);

module.exports = router;
