const express = require('express');
const router = express.Router();
const recentViewController = require('../controllers/RecentViewController');

router.post('/record', (req, res) => recentViewController.recordView(req, res));
router.get('/list', (req, res) => recentViewController.getRecentList(req, res));
router.delete('/remove', (req, res) => recentViewController.removeView(req, res));
router.delete('/clear', (req, res) => recentViewController.clearAll(req, res));

module.exports = router;
