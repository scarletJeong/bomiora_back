const express = require('express');
const router = express.Router();
const searchController = require('../controllers/SearchController');

// GET /api/search?q=...&rxLimit=20&storeLimit=20&contentLimit=20
router.get('/', (req, res) => searchController.search(req, res));

module.exports = router;

