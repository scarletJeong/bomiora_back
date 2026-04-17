const express = require('express');
const router = express.Router();
const getCategoryController = require('../controllers/GetCategoryController');

router.get('/list', (req, res) => getCategoryController.getByGroup(req, res));

module.exports = router;
