/**
 * 식품 영양정보 (bm_food_nutrition) 응답용 모델
 * 검색 시 칼로리/탄수화물/단백질/지방 등 기본 영양정보 반환
 */
class FoodNutrition {
  constructor(data = {}) {
    this.foodCode = data.food_code ?? data.foodCode ?? null;
    this.foodName = data.food_name ?? data.foodName ?? null;
    this.energy = data.energy != null ? Number(data.energy) : null;
    this.carbohydrates = data.carbohydrates != null ? Number(data.carbohydrates) : null;
    this.protein = data.protein != null ? Number(data.protein) : null;
    this.fat = data.fat != null ? Number(data.fat) : null;
    this.otherGrams = data.other_grams != null ? Number(data.other_grams) : null;
    this.representativeFoodName = data.representative_food_name ?? data.representativeFoodName ?? null;
    this.nutrientBaseQuantity = data.nutrient_base_quantity ?? data.nutrientBaseQuantity ?? null;
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
      nutrient_base_quantity: this.nutrientBaseQuantity
    };
  }
}

module.exports = FoodNutrition;
