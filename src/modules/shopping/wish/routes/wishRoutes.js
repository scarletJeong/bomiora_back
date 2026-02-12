const express = require('express');
const router = express.Router();
const wishController = require('../controllers/WishController');

router.post('/toggle', (req, res) => wishController.toggleWish(req, res));
router.get('/check', (req, res) => wishController.checkWish(req, res));
router.get('/list', (req, res) => wishController.getWishList(req, res));
router.delete('/remove', (req, res) => wishController.removeWish(req, res));

module.exports = router;
