const express = require('express');
const { adminLogin, logout } = require('../controllers/auth.controller');
const { verifyToken } = require('../middleware/auth.middleware');

const router = express.Router();

router.post('/login', adminLogin);
router.post('/logout', verifyToken, logout);

module.exports = router;
