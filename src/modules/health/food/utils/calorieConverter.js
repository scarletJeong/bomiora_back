const DEFAULT_NUTRIENT_BASE_QUANTITY = 100;

function extractNumber(value) {
  if (value == null) return null;
  const match = String(value).match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function extractUnit(value) {
  if (value == null) return null;
  const match = String(value).match(/[가-힣a-zA-Zμ]+/);
  return match ? match[0].toLowerCase() : null;
}

function isMeaningfulValue(value) {
  if (value == null) return false;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return false;
  if (['해당없음', '없음', 'none', 'null', 'n/a', 'na', '-'].includes(normalized)) return false;
  return true;
}

function firstDefinedValue(source, keys) {
  for (const key of keys) {
    if (isMeaningfulValue(source[key])) {
      return source[key];
    }
  }
  return null;
}

function firstDefinedNumber(source, keys) {
  const value = firstDefinedValue(source, keys);
  return extractNumber(value);
}

function normalizeDbType(value) {
  if (!value) return null;
  const raw = String(value).toLowerCase();
  if (raw === 'p') return 'processed';
  if (raw === 'd') return 'meal';
  if (raw === 'h') return 'health_functional';
  if (raw.includes('health') || raw.includes('functional') || raw.includes('건강')) return 'health_functional';
  if (raw.includes('processed') || raw.includes('가공')) return 'processed';
  if (raw.includes('food') || raw.includes('meal') || raw.includes('음식')) return 'meal';
  return null;
}

function estimateUnitWeight(unit) {
  if (!unit) return 1;
  if (unit.includes('캡슐') || unit.includes('capsule')) return 1;
  if (unit.includes('정') || unit.includes('tablet')) return 0.5;
  if (unit.includes('포') || unit.includes('sachet') || unit.includes('stick')) return 10;
  return 1;
}

function resolveBaseQuantity(source) {
  return (
    firstDefinedNumber(source, [
      'nutrient_base_quantity',
      'nutrientBaseQuantity',
      'nutrition_base_quantity',
      'nutritionBaseQuantity',
      'base_quantity',
      'baseQuantity'
    ]) || DEFAULT_NUTRIENT_BASE_QUANTITY
  );
}

function resolveFoodWeight(source) {
  return firstDefinedNumber(source, ['food_weight', 'foodWeight', 'total_weight', 'totalWeight']);
}

function resolveServingReference(source) {
  return firstDefinedNumber(source, [
    'one_serving_reference_amount',
    'oneServingReferenceAmount',
    'serving_reference_amount',
    'servingReferenceAmount',
    'serving_reference',
    'servingReference',
    'serving_size',
    'servingSize',
    'one_time_intake_reference',
    'oneTimeIntakeReference'
  ]);
}

function resolveHealthOneServingWeight(source) {
  const amountWeight = firstDefinedNumber(source, [
    'one_serving_weight',
    'oneServingWeight',
    'one_time_weight',
    'oneTimeWeight',
    'serving_weight',
    'servingWeight',
    'serving_amount_weight',
    'servingAmountWeight'
  ]);
  if (amountWeight != null) return amountWeight;

  const oneServingRaw = firstDefinedValue(source, [
    'one_serving_reference_amount',
    'oneServingReferenceAmount',
    'serving_reference_amount',
    'servingReferenceAmount',
    'serving_reference',
    'servingReference',
    'one_time_intake_reference',
    'oneTimeIntakeReference'
  ]);
  const amount = extractNumber(oneServingRaw);
  if (amount == null) return null;
  return amount * estimateUnitWeight(extractUnit(oneServingRaw));
}

function resolveDailyIntakeCount(source) {
  return (
    firstDefinedNumber(source, [
      'daily_intake_count',
      'dailyIntakeCount',
      'daily_frequency',
      'dailyFrequency',
      'intake_per_day',
      'intakePerDay'
    ]) || 1
  );
}

function inferDbType(source) {
  const explicit = normalizeDbType(
    firstDefinedValue(source, [
      'db_type',
      'dbType',
      'source_db',
      'sourceDb',
      'food_db_type',
      'foodDbType',
      'data_type_name',
      'dataTypeName',
      'data_type_code',
      'dataTypeCode'
    ])
  );
  if (explicit) return explicit;

  if (
    firstDefinedValue(source, [
      'daily_intake_count',
      'dailyIntakeCount',
      'one_serving_weight',
      'oneServingWeight',
      'one_time_weight',
      'oneTimeWeight'
    ]) != null
  ) {
    return 'health_functional';
  }

  if (
    firstDefinedValue(source, [
      'one_serving_reference_amount',
      'oneServingReferenceAmount',
      'serving_reference_amount',
      'servingReferenceAmount'
    ]) != null
  ) {
    return 'processed';
  }

  return 'meal';
}

function getEnergy(source) {
  const energy = firstDefinedNumber(source, ['energy', 'kcal', 'calories']);
  return energy == null || energy <= 0 ? 0 : energy;
}

function convertNutrientByWeight(value, baseQuantity, targetWeight) {
  const numeric = extractNumber(value);
  if (numeric == null) return null;
  return (numeric / baseQuantity) * targetWeight;
}

function buildWeightPlan(source, dbType, baseQuantity) {
  const foodWeight = resolveFoodWeight(source);
  if (dbType === 'processed') {
    const oneServingWeight = resolveServingReference(source) ?? foodWeight ?? baseQuantity;
    return { single: oneServingWeight, daily: oneServingWeight, total: foodWeight ?? oneServingWeight };
  }
  if (dbType === 'health_functional') {
    const oneServingWeight = resolveHealthOneServingWeight(source) ?? resolveServingReference(source) ?? baseQuantity;
    const dailyIntakeCount = resolveDailyIntakeCount(source);
    return { single: oneServingWeight, daily: oneServingWeight * dailyIntakeCount, total: foodWeight ?? oneServingWeight };
  }

  const mealWeight = foodWeight ?? resolveServingReference(source) ?? baseQuantity;
  return { single: mealWeight, daily: mealWeight, total: mealWeight };
}

function calculateConvertedNutrition(source, options = {}) {
  const dbType = inferDbType(source);
  const baseQuantity = resolveBaseQuantity(source);
  const weightPlan = buildWeightPlan(source, dbType, baseQuantity);
  const scenario = ['single', 'daily', 'total'].includes(options.scenario) ? options.scenario : 'single';
  const servingQuantity = extractNumber(source.serving_quantity) ?? 1;
  const targetWeight = (weightPlan[scenario] ?? weightPlan.single) * servingQuantity;
  const energy = getEnergy(source);
  const kcalPerUnit = energy / baseQuantity;

  return {
    dbType,
    baseQuantity,
    targetWeight,
    kcalPerUnit,
    kcal: kcalPerUnit * targetWeight,
    carbohydrate: convertNutrientByWeight(source.carbohydrates, baseQuantity, targetWeight),
    protein: convertNutrientByWeight(source.protein, baseQuantity, targetWeight),
    fat: convertNutrientByWeight(source.fat, baseQuantity, targetWeight),
    other: convertNutrientByWeight(source.other_grams ?? source.otherGrams, baseQuantity, targetWeight)
  };
}

module.exports = {
  extractNumber,
  extractUnit,
  calculateConvertedNutrition
};
