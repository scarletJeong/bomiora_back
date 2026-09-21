const pool = require('../../../../config/database');

class FoodRecordRepository {
  async create(data) {
    const [result] = await pool.query(
      `INSERT INTO bm_food_records
       (mb_id, record_date, food_time, eaten_at, photo, description, calories, protein, carbs, fat, other)
       VALUES (?, ?, ?, COALESCE(?, TIME(NOW())), ?, ?, ?, ?, ?, ?, ?)`,
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
        data.fat ?? null,
        data.other ?? null
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

  async findByMbIdAndDateWithItems(mbId, recordDate) {
    // 1. 식사 기록 먼저 조회
    const records = await this.findByMbIdAndDate(mbId, recordDate);
    if (records.length === 0) return [];

    const recordIds = records.map(r => r.id);

    // 2. 해당 기록들에 속한 모든 아이템 조회
    const [itemRows] = await pool.query(
      'SELECT * FROM bm_food_records_items WHERE food_record_id IN (?) ORDER BY item_id',
      [recordIds]
    );

    // 3. 기록별로 아이템 그룹화
    return records.map(r => ({
      ...r,
      items: itemRows.filter(i => i.food_record_id === r.id)
    }));
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
           other = COALESCE(?, other),
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
        data.other ?? null,
        id
      ]
    );
    return this.findById(id);
  }

  /** 식사 사진 URL만 갱신 (대표 photo + photos JSON 배열) */
  async updatePhotos(id, photo, photos = []) {
    const list = Array.isArray(photos) ? photos.filter(Boolean).slice(0, 3) : [];
    const representative = photo ?? list[0] ?? null;
    const photosJson = list.length > 0 ? JSON.stringify(list) : null;
    await pool.query(
      `UPDATE bm_food_records
       SET photo = ?, photos = ?, updated_at = NOW()
       WHERE id = ?`,
      [representative, photosJson, id]
    );
    return this.findById(id);
  }

  /** @deprecated 단일 사진 — updatePhotos 사용 권장 */
  async updatePhoto(id, photo) {
    const path = photo ? String(photo).trim() : null;
    return this.updatePhotos(id, path, path ? [path] : []);
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
       (food_record_id, food_code, food_name, serving_quantity, kcal, carbohydrate, protein, fat, other)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.foodRecordId,
        data.foodCode,
        data.foodName ?? null,
        data.servingQuantity ?? 1,
        data.kcal ?? null,
        data.carbohydrate ?? null,
        data.protein ?? null,
        data.fat ?? null,
        data.other ?? null
      ]
    );
    await this.updateRecordTotalsFromItems(data.foodRecordId);
    return result.insertId;
  }

  /** 식사 기록의 총 칼로리/탄단지를 items 합계로 갱신 */
  async updateRecordTotalsFromItems(foodRecordId) {
    await pool.query(
      `UPDATE bm_food_records r
       INNER JOIN (
         SELECT
           food_record_id,
           COALESCE(SUM(kcal), 0) as total_kcal,
           COALESCE(SUM(protein), 0) as total_protein,
           COALESCE(SUM(carbohydrate), 0) as total_carbs,
           COALESCE(SUM(fat), 0) as total_fat,
           COALESCE(SUM(other), 0) as total_other
         FROM bm_food_records_items
         WHERE food_record_id = ?
         GROUP BY food_record_id
       ) i ON r.id = i.food_record_id
       SET
         r.calories = i.total_kcal,
         r.protein  = i.total_protein,
         r.carbs    = i.total_carbs,
         r.fat      = i.total_fat,
         r.other    = i.total_other,
         r.updated_at = NOW()
       WHERE r.id = ?`,
      [foodRecordId, foodRecordId]
    );

    // 항목이 하나도 없을 경우 대비 (JOIN 실패 시 합계 0으로 리셋)
    await pool.query(
      `UPDATE bm_food_records r
       SET
         r.calories = 0, r.protein = 0, r.carbs = 0, r.fat = 0, r.other = 0,
         r.updated_at = NOW()
       WHERE r.id = ?
       AND NOT EXISTS (SELECT 1 FROM bm_food_records_items WHERE food_record_id = ?)`,
      [foodRecordId, foodRecordId]
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
