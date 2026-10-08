const express = require('express');
const router = express.Router();
const internalCacheController = require('../controllers/InternalCacheController');

router.post('/cache/invalidate', (req, res) =>
  internalCacheController.invalidate(req, res)
);

module.exports = router;
