const express = require('express');
const router = express.Router();
const searchController = require('../controllers/SearchController');

// GET /api/search?q=...&limit=5&section=prescription&offset=5
router.get('/', (req, res) => searchController.search(req, res));

module.exports = router;

