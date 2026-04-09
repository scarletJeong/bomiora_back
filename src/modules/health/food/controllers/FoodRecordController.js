const foodRecordRepository = require('../repositories/FoodRecordRepository');
const foodRepository = require('../repositories/FoodRepository');
const { toIsoUtcString } = require('../../../../utils/healthDateTime');

function mapFoodItemRows(rows) {
  return (rows || []).map((row) => ({
    item_id: row.item_id,
    food_record_id: row.food_record_id,
    food_code: row.food_code,
    food_name: row.food_name,
    serving_quantity: row.serving_quantity != null ? Number(row.serving_quantity) : null,
    kcal: row.kcal != null ? Number(row.kcal) : null,
    carbohydrate: row.carbohydrate != null ? Number(row.carbohydrate) : null,
    protein: row.protein != null ? Number(row.protein) : null,
    fat: row.fat != null ? Number(row.fat) : null,
    other: row.other != null ? Number(row.other) : null,
    created_at: toIsoUtcString(row.created_at)
  }));
}

function serializeFoodRecordRow(r, items = []) {
  if (!r) return null;
  return {
    id: r.id,
    mb_id: r.mb_id,
    record_date: r.record_date,
    food_time: String(r.food_time || '').toLowerCase(),
    eaten_at: toIsoUtcString(r.eaten_at),
    photo: r.photo,
    description: r.description,
    calories: r.calories != null ? Number(r.calories) : null,
    protein: r.protein != null ? Number(r.protein) : null,
    carbs: r.carbs != null ? Number(r.carbs) : null,
    fat: r.fat != null ? Number(r.fat) : null,
    other: r.other != null ? Number(r.other) : null,
    created_at: toIsoUtcString(r.created_at),
    updated_at: toIsoUtcString(r.updated_at),
    items
  };
}

class FoodRecordController {
  /** POST /api/health/food/records - 식사 기록 생성 */
  async create(req, res) {
    try {
      const { mb_id, record_date, food_time } = req.body;
      if (!mb_id || typeof mb_id !== 'string' || !mb_id.trim()) {
        return res.status(400).json({
          success: false,
          message: 'mb_id(회원 ID)가 필요합니다. 로그인 후 이용해 주세요.'
        });
      }
      if (!record_date || !food_time) {
        return res.status(400).json({
          success: false,
          message: 'record_date, food_time 이 필요합니다.'
        });
      }
      const id = await foodRecordRepository.create({
        mbId: String(mb_id).trim(),
        recordDate: record_date,
        foodTime: food_time,
        eatenAt: req.body.eaten_at,
        photo: req.body.photo,
        description: req.body.description,
        calories: req.body.calories,
        protein: req.body.protein,
        carbs: req.body.carbs,
        fat: req.body.fat,
        other: req.body.other
      });
      const record = await foodRecordRepository.findById(id);
      return res.status(201).json({
        success: true,
        message: '식사 기록이 추가되었습니다.',
        data: serializeFoodRecordRow(record, [])
      });
    } catch (error) {
      console.error('[FoodRecordController.create]', error.message);
      if (error.code) console.error('  DB code:', error.code);
      return res.status(500).json({
        success: false,
        message: `식사 기록 추가 실패: ${error.message}`
      });
    }
  }

  /** GET /api/health/food/records?mb_id=xxx&record_date=2025-01-15 - 해당 날짜 식사 목록 */
  async getByDate(req, res) {
    try {
      const { mb_id, record_date } = req.query;
      if (!mb_id || !record_date) {
        return res.status(400).json({
          success: false,
          message: 'mb_id, record_date 가 필요합니다.'
        });
      }
      const records = await foodRecordRepository.findByMbIdAndDate(mb_id, record_date);
      const withItems = await Promise.all(
        records.map(async (r) => {
          const rows = await foodRecordRepository.findFoodItemsByFoodRecordId(r.id);
          return serializeFoodRecordRow(r, mapFoodItemRows(rows));
        })
      );
      return res.json({
        success: true,
        data: withItems
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `식사 기록 조회 실패: ${error.message}`
      });
    }
  }

  /** POST /api/health/food/records/:foodRecordId/items - 해당 식사에 음식 추가 */
  async addFoodItem(req, res) {
    try {
      const foodRecordId = Number(req.params.foodRecordId);
      const record = await foodRecordRepository.findById(foodRecordId);
      if (!record) {
        return res.status(404).json({
          success: false,
          message: '식사 기록을 찾을 수 없습니다.'
        });
      }
      const foodCode = req.body.food_code;
      const food = await foodRepository.findByFoodCode(foodCode);
      const serving = Number(req.body.serving_quantity) || 1;

      await foodRecordRepository.addFoodItem({
        foodRecordId,
        foodCode,
        foodName: food ? food.foodName : req.body.food_name,
        servingQuantity: serving,
        kcal: food ? (food.energy != null ? food.energy * serving : null) : req.body.energy,
        carbohydrate: food
          ? (food.carbohydrates != null ? food.carbohydrates * serving : null)
          : req.body.carbohydrates,
        protein: food ? (food.protein != null ? food.protein * serving : null) : req.body.protein,
        fat: food ? (food.fat != null ? food.fat * serving : null) : req.body.fat,
        other: food ? (food.otherGrams != null ? food.otherGrams * serving : null) : req.body.other
      });
      const items = await foodRecordRepository.findFoodItemsByFoodRecordId(foodRecordId);
      return res.status(201).json({
        success: true,
        message: '음식이 추가되었습니다.',
        data: { food_record_id: foodRecordId, items: mapFoodItemRows(items) }
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `음식 추가 실패: ${error.message}`
      });
    }
  }

  /** DELETE /api/health/food/records/:foodRecordId/items/:itemId - 해당 식사에서 음식 항목 삭제 */
  async deleteFoodItem(req, res) {
    try {
      const foodRecordId = Number(req.params.foodRecordId);
      const itemId = Number(req.params.itemId);
      const deleted = await foodRecordRepository.deleteFoodItemById(itemId);
      if (!deleted) {
        return res.status(404).json({
          success: false,
          message: '해당 음식 항목을 찾을 수 없습니다.'
        });
      }
      await foodRecordRepository.updateRecordTotalsFromItems(foodRecordId);
      return res.json({
        success: true,
        message: '음식이 삭제되었습니다.'
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `음식 삭제 실패: ${error.message}`
      });
    }
  }

  /** DELETE /api/health/food/records/:foodRecordId - 식사 기록 삭제 */
  async delete(req, res) {
    try {
      const foodRecordId = Number(req.params.foodRecordId);
      const deleted = await foodRecordRepository.deleteById(foodRecordId);
      if (!deleted) {
        return res.status(404).json({
          success: false,
          message: '식사 기록을 찾을 수 없습니다.'
        });
      }
      return res.json({
        success: true,
        message: '식사 기록이 삭제되었습니다.'
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `식사 기록 삭제 실패: ${error.message}`
      });
    }
  }
}

module.exports = new FoodRecordController();
