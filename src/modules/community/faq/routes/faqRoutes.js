const express = require('express');
const router = express.Router();
const faqController = require('../controllers/FaqController');

router.get('/list', (req, res) => faqController.getList(req, res));
router.get('/:id', (req, res) => faqController.getDetail(req, res));

module.exports = router;
