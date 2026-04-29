const express = require('express');
const router = express.Router();
const faqController = require('../controllers/FaqController');

/** 목록만 제공 (앱은 한 화면 아코디언). 상세 GET /:id 는 제거됨. */
router.get('/list', (req, res) => faqController.getList(req, res));

module.exports = router;
