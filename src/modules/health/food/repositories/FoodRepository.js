const pool = require('../../../../config/database');
const FoodNutrition = require('../models/FoodNutrition');

/** 탄수화물·단백질·지방 제외, g 단위 성분만 합산 (kcal/mg/μg 미포함 → 의미 있는 질량 합) */
const OTHER_GRAMS_EXPR = `(
  COALESCE(water, 0) + COALESCE(ash, 0) + COALESCE(sugar, 0) + COALESCE(dietary_fiber, 0)
  + COALESCE(saturated_fatty_acid, 0) + COALESCE(trans_fatty_acid, 0)
  + COALESCE(fructose_g, 0) + COALESCE(sugar_alcohol, 0) + COALESCE(allulose, 0)
  + COALESCE(lactose, 0) + COALESCE(sucrose, 0) + COALESCE(glucose, 0)
  + COALESCE(unsaturated_fatty_acid, 0) + COALESCE(omega3_fatty_acid, 0) + COALESCE(omega6_fatty_acid, 0)
  + COALESCE(alcohol, 0)
)`;

class FoodRepository {
  /**
   * food_name(식품명)으로 검색. 에너지, 탄수화물, 단백질, 지방 + 기타(g 합계)
   * @param {string} keyword - 검색어 (식품명 일부)
   * @param {number} limit - 최대 건수 (기본 20)
   */
  async searchByFoodName(keyword, limit = 20) {
    const like = `%${(keyword || '').trim().replace(/%/g, '\\%')}%`;
    const [rows] = await pool.query(
      `SELECT food_code, food_name,
              energy,
              carbohydrates,
              protein, fat,
              representative_food_name, nutrient_base_quantity,
              ${OTHER_GRAMS_EXPR} AS other_grams
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
      `SELECT food_code, food_name,
              energy,
              carbohydrates,
              protein, fat,
              representative_food_name, nutrient_base_quantity,
              ${OTHER_GRAMS_EXPR} AS other_grams
       FROM bm_food_nutrition WHERE food_code = ?`,
      [foodCode]
    );
    return rows.length ? new FoodNutrition(rows[0]) : null;
  }
}

module.exports = new FoodRepository();
