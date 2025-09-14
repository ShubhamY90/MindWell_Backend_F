const express = require('express');
const {signup, signin, loginPsychiatrist, loginAdmin} = require('../controllers/authController.js');

const router = express.Router();

router.post('/signup', signup);
router.post('/signin', signin);
router.post('/psychiatrist/login', loginPsychiatrist);
router.post('/admin/login', loginAdmin);

module.exports = router;