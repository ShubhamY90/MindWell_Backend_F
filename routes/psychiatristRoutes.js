const express = require('express');
const { loginPsychiatrist } = require('../controllers/psychiatristAuthController');

const router = express.Router();

// Separate route space for psychiatrists
router.post('/psychiatrist/login', loginPsychiatrist);

module.exports = router;


