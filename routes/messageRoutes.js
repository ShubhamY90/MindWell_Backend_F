const express = require('express');
const rateLimit = require('express-rate-limit');
const { sendMessage } = require('../controllers/messageController.js');

const router = express.Router();

// Rate limiter: Max 20 messages per minute per IP
const messageRateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 20, // Limit each IP to 20 requests per `window` (here, per minute)
    message: { error: 'Too many messages sent from this IP, please try again after a minute' },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

router.post('/send', messageRateLimiter, sendMessage);

module.exports = router;
