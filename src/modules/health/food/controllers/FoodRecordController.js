const fs = require('fs');
const path = require('path');
const foodRecordRepository = require('../repositories/FoodRecordRepository');
const foodRepository = require('../repositories/FoodRepository');
const { toIsoUtcString } = require('../../../../utils/healthDateTime');
const { calculateConvertedNutrition } = require('../utils/calorieConverter');

const UPLOAD_DIR =
  process.env.FOOD_IMAGE_UPLOAD_DIR ||
  path.join(process.cwd(), 'uploads', 'food_images');

function bufferFieldToString(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'string') return value;
  if (Buffer.isBuffer(value)) return value.toString('utf8');
  if (
    typeof value === 'object' &&
    value.type === 'Buffer' &&
    Array.isArray(value.data)
  ) {
    return Buffer.from(value.data).toString('utf8');
  }
  return String(value);
}

/** MySQL DATE → YYYY-MM-DD (KST 달력 기준) */
function formatRecordDateYmd(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'string') {
    const t = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
    const d = new Date(t);
    if (!Number.isNaN(d.getTime())) {
      const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
      return kst.toISOString().slice(0, 10);
    }
    return t.length >= 10 ? t.slice(0, 10) : t;
  }
  if (value instanceof Date) {
    const kst = new Date(value.getTime() + 9 * 60 * 60 * 1000);
    return kst.toISOString().slice(0, 10);
  }
  return String(value);
}

function mapFoodItemRows(rows) {
  return (rows || []).map((row) => ({
    item_id: row.item_id,
    food_record_id: row.food_record_id,
    food_code: bufferFieldToString(row.food_code),
    food_name: bufferFieldToString(row.food_name),
    serving_quantity: row.serving_quantity != null ? Number(row.serving_quantity) : null,
    kcal: row.kcal != null ? Number(row.kcal) : null,
    carbohydrate: row.carbohydrate != null ? Number(row.carbohydrate) : null,
    protein: row.protein != null ? Number(row.protein) : null,
    fat: row.fat != null ? Number(row.fat) : null,
    other: row.other != null ? Number(row.other) : null,
    created_at: toIsoUtcString(row.created_at)
  }));
}

const MAX_MEAL_PHOTOS = 3;

function parsePhotoPathList(raw) {
  const paths = [];
  if (raw == null) return paths;

  let value = raw;
  if (Buffer.isBuffer(value)) {
    value = value.toString('utf8');
  } else if (typeof value === 'object' && value.type === 'Buffer' && Array.isArray(value.data)) {
    value = Buffer.from(value.data).toString('utf8');
  }

  if (typeof value === 'string') {
    const trimmed = value.trim().replace(/^\uFEFF/, '');
    if (!trimmed) return paths;
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          for (const p of parsed) {
            if (typeof p === 'string' && p.trim()) paths.push(p.trim());
          }
        }
      } catch (_) {
        /* ignore */
      }
      return paths;
    }
    paths.push(trimmed);
    return paths;
  }

  if (Array.isArray(value)) {
    for (const p of value) {
      if (typeof p === 'string' && p.trim()) paths.push(p.trim());
    }
  }
  return paths;
}

function parsePhotosFromRow(row) {
  const paths = [];
  const seen = new Set();

  const addPaths = (list) => {
    for (const p of list) {
      const key = String(p).trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      paths.push(key);
    }
  };

  if (row && row.photos != null) {
    addPaths(parsePhotoPathList(row.photos));
  }

  if (paths.length === 0 && row && row.photo != null) {
    addPaths(parsePhotoPathList(row.photo));
  }

  return paths.slice(0, MAX_MEAL_PHOTOS);
}

function normalizePhotoPayload(body) {
  if (Object.prototype.hasOwnProperty.call(body, 'image_paths')) {
    const raw = body.image_paths;
    if (!Array.isArray(raw)) {
      return { photo: null, photos: [] };
    }
    const photos = raw
      .filter((p) => typeof p === 'string' && p.trim())
      .map((p) => p.trim())
      .slice(0, MAX_MEAL_PHOTOS);
    return { photo: photos[0] || null, photos };
  }

  const hasSingle =
    Object.prototype.hasOwnProperty.call(body, 'image_path') ||
    Object.prototype.hasOwnProperty.call(body, 'photo');
  if (!hasSingle) return null;

  const single =
    body.image_path !== undefined ? body.image_path : body.photo;
  if (single === null || single === '') {
    return { photo: null, photos: [] };
  }
  const path = String(single).trim();
  return { photo: path, photos: path ? [path] : [] };
}

function serializeFoodRecordRow(r, items = []) {
  if (!r) return null;
  const imagePaths = parsePhotosFromRow(r);
  const representative = imagePaths[0] || r.photo || null;
  return {
    id: r.id,
    mb_id: bufferFieldToString(r.mb_id),
    record_date: formatRecordDateYmd(r.record_date),
    food_time: String(r.food_time || '').toLowerCase(),
    eaten_at: toIsoUtcString(r.eaten_at),
    photo: representative,
    image_path: representative,
    image_paths: imagePaths,
    photos: imagePaths,
    photos_json:
      r.photos != null && typeof r.photos === 'string'
        ? r.photos
        : imagePaths.length > 0
          ? JSON.stringify(imagePaths)
          : null,
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
  getUploadDir() {
    return UPLOAD_DIR;
  }

  /** POST /api/health/food/upload-image - 식사 사진 업로드 */
  async uploadImage(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: '이미지 업로드 실패: 파일이 없습니다.'
        });
      }

      const fileUrl = `/api/health/food/images/${req.file.filename}`;

      return res.json({
        success: true,
        filename: req.file.filename,
        url: fileUrl,
        message: '이미지 업로드 성공'
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: `이미지 업로드 실패: ${error.message}`
      });
    }
  }

  /** GET /api/health/food/images/:filename - 업로드된 식사 사진 */
  async getImage(req, res) {
    try {
      const filePath = path.join(UPLOAD_DIR, req.params.filename);
      if (!fs.existsSync(filePath)) {
        return res.status(404).end();
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentTypeMap = {
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg'
      };

      res.setHeader('Content-Type', contentTypeMap[ext] || 'image/jpeg');
      return res.sendFile(filePath);
    } catch (error) {
      return res.status(400).end();
    }
  }

  /** PUT /api/health/food/records/:foodRecordId - 식사 기록 수정 (사진 URL 등) */
  async update(req, res) {
    try {
      const foodRecordId = Number(req.params.foodRecordId);
      if (!Number.isFinite(foodRecordId) || foodRecordId <= 0) {
        return res.status(400).json({
          success: false,
          message: '유효하지 않은 foodRecordId 입니다.'
        });
      }

      const record = await foodRecordRepository.findById(foodRecordId);
      if (!record) {
        return res.status(404).json({
          success: false,
          message: '식사 기록을 찾을 수 없습니다.'
        });
      }

      const photoPayload = normalizePhotoPayload(req.body);

      if (photoPayload) {
        await foodRecordRepository.updatePhotos(
          foodRecordId,
          photoPayload.photo,
          photoPayload.photos
        );
      } else {
        await foodRecordRepository.update(foodRecordId, {
          eatenAt: req.body.eaten_at,
          photo: req.body.photo,
          description: req.body.description,
          calories: req.body.calories,
          protein: req.body.protein,
          carbs: req.body.carbs,
          fat: req.body.fat,
          other: req.body.other
        });
      }

      const updated = await foodRecordRepository.findById(foodRecordId);
      const items = await foodRecordRepository.findFoodItemsByFoodRecordId(
        foodRecordId
      );

      return res.json({
        success: true,
        message: '식사 기록이 수정되었습니다.',
        data: serializeFoodRecordRow(updated, mapFoodItemRows(items))
      });
    } catch (error) {
      console.error('[FoodRecordController.update]', error.message);
      return res.status(500).json({
        success: false,
        message: `식사 기록 수정 실패: ${error.message}`
      });
    }
  }

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
      const scenario = req.body.calorie_scenario || 'single';

      const converted = food
        ? calculateConvertedNutrition(
            {
              ...food.toResponse(),
              serving_quantity: serving
            },
            { scenario }
          )
        : null;

      await foodRecordRepository.addFoodItem({
        foodRecordId,
        foodCode,
        foodName: food ? food.foodName : req.body.food_name,
        servingQuantity: serving,
        kcal: food ? converted.kcal : req.body.energy,
        carbohydrate: food ? converted.carbohydrate : req.body.carbohydrates,
        protein: food ? converted.protein : req.body.protein,
        fat: food ? converted.fat : req.body.fat,
        other: food ? converted.other : req.body.other
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
