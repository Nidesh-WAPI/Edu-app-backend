const express = require('express');
const { verifyCustomerToken } = require('../middleware/auth.middleware');
const { generateQuiz, submitQuiz, getHistory } = require('../controllers/quiz.controller');

const router = express.Router();

router.post('/generate', verifyCustomerToken, generateQuiz);
router.post('/submit',   verifyCustomerToken, submitQuiz);
router.get('/history',   verifyCustomerToken, getHistory);

module.exports = router;
