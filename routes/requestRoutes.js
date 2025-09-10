const express = require('express');
const { createRequest, respondToRequest, listRequestsByCollege, respondToRequestAtomic } = require('../controllers/requestController.js');
const router = express.Router();

// POST /api/request/create
router.post('/create', createRequest);

// POST /api/request/respond/:id (legacy non-atomic)
router.post('/respond/:id', respondToRequest);

// POST /api/request/respond-atomic/:id (recommended)
router.post('/respond-atomic/:id', respondToRequestAtomic);

// GET /api/request/college/:college?status=pending
router.get('/college/:college', listRequestsByCollege);

module.exports = router;
