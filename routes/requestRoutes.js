const express = require('express');
const { createRequest, respondToRequest } = require('../controllers/requestController.js');
const router = express.Router();

// POST /api/requests/create
router.post('/create', createRequest);
router.post('/respond/:id', respondToRequest);
module.exports = router;
