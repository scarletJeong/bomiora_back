const express = require('express');
const router = express.Router();
const contentController = require('../controllers/ContentController');

router.get('/list', (req, res) => contentController.getList(req, res));
router.post('/:id/recommend', (req, res) => contentController.postRecommend(req, res));
router.get('/:id', (req, res) => contentController.getDetail(req, res));

module.exports = router;

