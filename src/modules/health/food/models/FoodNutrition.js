/**
 * 식품 영양정보 (bm_food_nutrition) 응답용 모델
 * 검색 시 칼로리/탄수화물/단백질/지방 등 기본 영양정보 반환
 */
function normalizeText(value) {
  if (Buffer.isBuffer(value)) return value.toString('utf8');
  return value;
}

class FoodNutrition {
  constructor(data = {}) {
    this.foodCode = normalizeText(data.food_code ?? data.foodCode ?? null);
    this.foodName = normalizeText(data.food_name ?? data.foodName ?? null);
    this.energy = data.energy != null ? Number(data.energy) : null;
    this.carbohydrates = data.carbohydrates != null ? Number(data.carbohydrates) : null;
    this.protein = data.protein != null ? Number(data.protein) : null;
    this.fat = data.fat != null ? Number(data.fat) : null;
    this.otherGrams = data.other_grams != null ? Number(data.other_grams) : null;
    this.representativeFoodName = normalizeText(data.representative_food_name ?? data.representativeFoodName ?? null);
    this.nutrientBaseQuantity = normalizeText(data.nutrient_base_quantity ?? data.nutrientBaseQuantity ?? null);
    this.foodWeight = normalizeText(data.food_weight ?? data.foodWeight ?? data.total_weight ?? data.totalWeight ?? null);
    this.servingReferenceAmount =
      normalizeText(
        data.one_serving_reference_amount ??
          data.oneServingReferenceAmount ??
          data.serving_reference_amount ??
          data.servingReferenceAmount ??
          data.serving_reference ??
          data.servingReference ??
          null
      );
    this.oneServingWeight =
      normalizeText(
        data.one_serving_weight ??
          data.oneServingWeight ??
          data.one_time_weight ??
          data.oneTimeWeight ??
          data.serving_amount_weight ??
          data.servingAmountWeight ??
          null
      );
    this.dailyIntakeCount =
      normalizeText(data.daily_intake_count ?? data.dailyIntakeCount ?? data.daily_frequency ?? data.dailyFrequency ?? null);
    this.dbType =
      normalizeText(
        data.db_type ??
          data.dbType ??
          data.source_db ??
          data.sourceDb ??
          data.data_type_name ??
          data.dataTypeName ??
          data.data_type_code ??
          data.dataTypeCode ??
          null
      );
  }

  toResponse() {
    return {
      food_code: this.foodCode,
      food_name: this.foodName,
      energy: this.energy,
      carbohydrates: this.carbohydrates,
      protein: this.protein,
      fat: this.fat,
      other_grams: this.otherGrams,
      representative_food_name: this.representativeFoodName,
      nutrient_base_quantity: this.nutrientBaseQuantity,
      food_weight: this.foodWeight,
      one_serving_reference_amount: this.servingReferenceAmount,
      one_serving_weight: this.oneServingWeight,
      daily_intake_count: this.dailyIntakeCount,
      db_type: this.dbType
    };
  }
}

module.exports = FoodNutrition;
