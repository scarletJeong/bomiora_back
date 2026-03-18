const pool = require('../../../../config/database');
const FoodNutrition = require('../models/FoodNutrition');

class FoodRepository {
  /**
   * food_name(식품명)으로 검색. 기본으로 칼로리, 탄수화물, 단백질, 지방 반환
   * @param {string} keyword - 검색어 (식품명 일부)
   * @param {number} limit - 최대 건수 (기본 20)
   */
  async searchByFoodName(keyword, limit = 20) {
    const like = `%${(keyword || '').trim().replace(/%/g, '\\%')}%`;
    const [rows] = await pool.query(
      `SELECT food_code, food_name, kcal, carbohydrate, protein, fat,
              representative_food_name, nutrient_base_quantity
       FROM bm_food_nutrition
       WHERE food_name LIKE ? OR representative_food_name LIKE ?
       ORDER BY food_name
       LIMIT ?`,
      [like, like, Math.min(Number(limit) || 20, 100)]
    );
    return rows.map((r) => new FoodNutrition(r));
  }

  /**
   * food_code로 1건 조회 (기본 영양정보)
   */
  async findByFoodCode(foodCode) {
    const [rows] = await pool.query(
      `SELECT food_code, food_name, kcal, carbohydrate, protein, fat,
              representative_food_name, nutrient_base_quantity
       FROM bm_food_nutrition WHERE food_code = ?`,
      [foodCode]
    );
    return rows.length ? new FoodNutrition(rows[0]) : null;
  }
}

module.exports = new FoodRepository();
