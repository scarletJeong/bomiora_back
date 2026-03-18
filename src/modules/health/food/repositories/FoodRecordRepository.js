const pool = require('../../../../config/database');

class FoodRecordRepository {
  async create(data) {
    const [result] = await pool.query(
      `INSERT INTO bm_food_records
       (mb_id, record_date, food_time, eaten_at, photo, description, calories, protein, carbs, fat)
       VALUES (?, ?, ?, COALESCE(?, TIME(NOW())), ?, ?, ?, ?, ?, ?)`,
      [
        data.mbId,
        data.recordDate,
        data.foodTime,
        data.eatenAt ?? null,
        data.photo ?? null,
        data.description ?? null,
        data.calories ?? null,
        data.protein ?? null,
        data.carbs ?? null,
        data.fat ?? null
      ]
    );
    return result.insertId;
  }

  async findById(id) {
    const [rows] = await pool.query(
      'SELECT * FROM bm_food_records WHERE id = ?',
      [id]
    );
    return rows[0] || null;
  }

  async findByMbIdAndDate(mbId, recordDate) {
    const [rows] = await pool.query(
      `SELECT * FROM bm_food_records
       WHERE mb_id = ? AND record_date = ?
       ORDER BY FIELD(food_time, 'breakfast', 'lunch', 'dinner', 'snack')`,
      [mbId, recordDate]
    );
    return rows;
  }

  async update(id, data) {
    await pool.query(
      `UPDATE bm_food_records
       SET eaten_at = COALESCE(?, eaten_at),
           photo = COALESCE(?, photo),
           description = COALESCE(?, description),
           calories = COALESCE(?, calories),
           protein = COALESCE(?, protein),
           carbs = COALESCE(?, carbs),
           fat = COALESCE(?, fat),
           updated_at = NOW()
       WHERE id = ?`,
      [
        data.eatenAt ?? null,
        data.photo ?? null,
        data.description ?? null,
        data.calories ?? null,
        data.protein ?? null,
        data.carbs ?? null,
        data.fat ?? null,
        id
      ]
    );
    return this.findById(id);
  }

  async deleteById(id) {
    const [result] = await pool.query(
      'DELETE FROM bm_food_records WHERE id = ?',
      [id]
    );
    return result.affectedRows > 0;
  }

  async addFoodItem(data) {
    const [result] = await pool.query(
      `INSERT INTO bm_food_records_items
       (food_record_id, food_code, food_name, serving_quantity, kcal, carbohydrate, protein, fat)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.foodRecordId,
        data.foodCode,
        data.foodName ?? null,
        data.servingQuantity ?? 1,
        data.kcal ?? null,
        data.carbohydrate ?? null,
        data.protein ?? null,
        data.fat ?? null
      ]
    );
    await this.updateRecordTotalsFromItems(data.foodRecordId);
    return result.insertId;
  }

  /** 식사 기록의 총 칼로리/탄단지를 items 합계로 갱신 */
  async updateRecordTotalsFromItems(foodRecordId) {
    await pool.query(
      `UPDATE bm_food_records r SET
        r.calories = (SELECT COALESCE(SUM(i.kcal), 0) FROM bm_food_records_items i WHERE i.food_record_id = r.id),
        r.protein  = (SELECT COALESCE(SUM(i.protein), 0) FROM bm_food_records_items i WHERE i.food_record_id = r.id),
        r.carbs    = (SELECT COALESCE(SUM(i.carbohydrate), 0) FROM bm_food_records_items i WHERE i.food_record_id = r.id),
        r.fat      = (SELECT COALESCE(SUM(i.fat), 0) FROM bm_food_records_items i WHERE i.food_record_id = r.id),
        r.updated_at = NOW()
       WHERE r.id = ?`,
      [foodRecordId]
    );
  }

  async findFoodItemsByFoodRecordId(foodRecordId) {
    const [rows] = await pool.query(
      'SELECT * FROM bm_food_records_items WHERE food_record_id = ? ORDER BY item_id',
      [foodRecordId]
    );
    return rows;
  }

  async deleteFoodItemById(itemId) {
    const [result] = await pool.query(
      'DELETE FROM bm_food_records_items WHERE item_id = ?',
      [itemId]
    );
    return result.affectedRows > 0;
  }
}

module.exports = new FoodRecordRepository();
