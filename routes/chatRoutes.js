const express = require('express');
const { chatWithGemini, analyzeMoodTest } = require('../controllers/chatController.js');

const router = express.Router();
router.post('/analyzeMoodTest', analyzeMoodTest);
router.post('/chat', chatWithGemini);

module.exports = router;