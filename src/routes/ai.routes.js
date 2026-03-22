const express = require('express');
const { verifyCustomerToken } = require('../middleware/auth.middleware');
const { chatWithAI, deepDive } = require('../controllers/ai.controller');

const router = express.Router();

router.post('/chat', verifyCustomerToken, chatWithAI);
router.post('/deep-dive', verifyCustomerToken, deepDive);

module.exports = router;
