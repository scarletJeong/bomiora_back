const foodRepository = require('../repositories/FoodRepository');

class FoodController {
  /**
   * GET /api/health/food/search?q=국밥&limit=20
   * 식품명 검색 → 칼로리(kcal), 탄수화물, 단백질, 지방 반환
   */
  async search(req, res) {
    try {
      const q = req.query.q || req.query.keyword || '';
      const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
      const list = await foodRepository.searchByFoodName(q, limit);
      return res.json({
        success: true,
        data: list.map((item) => item.toResponse())
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `음식 검색 실패: ${error.message}`
      });
    }
  }

  /**
   * GET /api/health/food/:foodCode
   * 식품코드로 1건 조회 (칼로리/탄수화물/단백질/지방)
   */
  async getByFoodCode(req, res) {
    try {
      const foodCode = req.params.foodCode;
      const item = await foodRepository.findByFoodCode(foodCode);
      if (!item) {
        return res.status(404).json({
          success: false,
          message: '해당 식품을 찾을 수 없습니다.'
        });
      }
      return res.json({
        success: true,
        data: item.toResponse()
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `식품 조회 실패: ${error.message}`
      });
    }
  }
}

module.exports = new FoodController();
