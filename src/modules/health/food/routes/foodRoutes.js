const express = require('express');
const router = express.Router();
const foodController = require('../controllers/FoodController');
const foodRecordController = require('../controllers/FoodRecordController');

// 음식 검색 (food_name → 칼로리/탄수화물/단백질/지방)
router.get('/search', (req, res) => foodController.search(req, res));
// 식사 기록 (반드시 /:foodCode 보다 위에)
router.get('/records', (req, res) => foodRecordController.getByDate(req, res));
router.post('/records', (req, res) => foodRecordController.create(req, res));
router.post('/records/:foodRecordId/items', (req, res) => foodRecordController.addFoodItem(req, res));
router.delete('/records/:foodRecordId/items/:itemId', (req, res) => foodRecordController.deleteFoodItem(req, res));
router.delete('/records/:foodRecordId', (req, res) => foodRecordController.delete(req, res));
// 식품코드로 1건 조회
router.get('/:foodCode', (req, res) => foodController.getByFoodCode(req, res));

module.exports = router;
