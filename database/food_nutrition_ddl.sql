-- =============================================================================
-- 건강 모듈 - 식품 영양정보 및 식사 기록 DDL
-- 용도: 칼로리 검색(food_name 검색) / 식사 기록(먹은 음식 저장)
-- 회원 구분: mb_id VARCHAR(50) (체중/혈압/혈당/생리주기와 동일)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 식품 영양정보 마스터 (bm_food_nutrition)
--    최종 통합 컬럼 기준:
--    식품 / 건강기능식품 / 가공식품 3종 DB를 공통 헤더로 적재
--    - 공통 핵심 영양소 중심으로 축소
--    - 원천별 차이 컬럼은 관리번호 1개로 통합
--    - 없는 값은 NULL 허용
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bm_food_nutrition (
  food_code VARCHAR(50) NOT NULL COMMENT '식품코드(PK)',
  food_name VARCHAR(300) NOT NULL COMMENT '식품명',
  data_type_code VARCHAR(30) DEFAULT NULL COMMENT '데이터구분코드',
  data_type_name VARCHAR(100) DEFAULT NULL COMMENT '데이터구분명',
  food_origin_code VARCHAR(30) DEFAULT NULL COMMENT '식품기원코드',
  food_origin_name VARCHAR(100) DEFAULT NULL COMMENT '식품기원명',
  food_category_code VARCHAR(30) DEFAULT NULL COMMENT '식품대분류코드',
  food_category_name VARCHAR(200) DEFAULT NULL COMMENT '식품대분류명',
  representative_food_code VARCHAR(50) DEFAULT NULL COMMENT '대표식품코드',
  representative_food_name VARCHAR(200) DEFAULT NULL COMMENT '대표식품명',
  food_medium_category_code VARCHAR(30) DEFAULT NULL COMMENT '식품중분류코드',
  food_medium_category_name VARCHAR(200) DEFAULT NULL COMMENT '식품중분류명',
  food_subcategory_code VARCHAR(30) DEFAULT NULL COMMENT '식품소분류코드',
  food_subcategory_name VARCHAR(200) DEFAULT NULL COMMENT '식품소분류명',
  food_detail_category_code VARCHAR(30) DEFAULT NULL COMMENT '식품세분류코드',
  food_detail_category_name VARCHAR(200) DEFAULT NULL COMMENT '식품세분류명',
  nutrient_base_quantity VARCHAR(80) DEFAULT NULL COMMENT '영양성분제공단위량',

  energy DECIMAL(10,2) DEFAULT NULL COMMENT '에너지(kcal)',
  water DECIMAL(14,6) DEFAULT NULL COMMENT '수분(g)',
  protein DECIMAL(14,6) DEFAULT NULL COMMENT '단백질(g)',
  fat DECIMAL(14,6) DEFAULT NULL COMMENT '지방(g)',
  ash DECIMAL(14,6) DEFAULT NULL COMMENT '회분(g)',
  carbohydrates DECIMAL(14,6) DEFAULT NULL COMMENT '탄수화물(g)',
  sugar DECIMAL(14,6) DEFAULT NULL COMMENT '당류(g)',
  dietary_fiber DECIMAL(14,6) DEFAULT NULL COMMENT '식이섬유(g)',
  calcium DECIMAL(14,6) DEFAULT NULL COMMENT '칼슘(mg)',
  iron DECIMAL(14,6) DEFAULT NULL COMMENT '철(mg)',
  phosphorus DECIMAL(14,6) DEFAULT NULL COMMENT '인(mg)',
  potassium DECIMAL(14,6) DEFAULT NULL COMMENT '칼륨(mg)',
  sodium DECIMAL(14,6) DEFAULT NULL COMMENT '나트륨(mg)',
  vitamin_a DECIMAL(14,6) DEFAULT NULL COMMENT '비타민A(μg RAE)',
  retinol DECIMAL(14,6) DEFAULT NULL COMMENT '레티놀(μg)',
  thiamine DECIMAL(14,6) DEFAULT NULL COMMENT '티아민(mg)',
  niacin DECIMAL(14,6) DEFAULT NULL COMMENT '니아신(mg)',
  vitamin_c DECIMAL(14,6) DEFAULT NULL COMMENT '비타민 C(mg)',
  vitamin_d DECIMAL(14,6) DEFAULT NULL COMMENT '비타민 D(μg)',
  cholesterol DECIMAL(14,6) DEFAULT NULL COMMENT '콜레스테롤(mg)',
  saturated_fatty_acid DECIMAL(14,6) DEFAULT NULL COMMENT '포화지방산(g)',
  trans_fatty_acid DECIMAL(14,6) DEFAULT NULL COMMENT '트랜스지방산(g)',
  biotin DECIMAL(14,6) DEFAULT NULL COMMENT '비오틴(μg)',
  vitamin_b6 DECIMAL(14,6) DEFAULT NULL COMMENT '비타민 B6 / 피리독신(mg)',
  vitamin_b12 DECIMAL(14,6) DEFAULT NULL COMMENT '비타민 B12(μg)',
  folate DECIMAL(14,6) DEFAULT NULL COMMENT '엽산(μg DFE)',
  pantothenic_acid DECIMAL(14,6) DEFAULT NULL COMMENT '판토텐산(mg)',
  vitamin_d2 DECIMAL(14,6) DEFAULT NULL COMMENT '비타민 D2(μg)',
  vitamin_d3 DECIMAL(14,6) DEFAULT NULL COMMENT '비타민 D3(μg)',
  vitamin_e DECIMAL(14,6) DEFAULT NULL COMMENT '비타민 E(mg α-TE)',
  vitamin_k DECIMAL(14,6) DEFAULT NULL COMMENT '비타민 K(μg)',
  vitamin_k1 DECIMAL(14,6) DEFAULT NULL COMMENT '비타민 K1(μg)',
  vitamin_k2 DECIMAL(14,6) DEFAULT NULL COMMENT '비타민 K2(μg)',
  fructose_g DECIMAL(14,6) DEFAULT NULL COMMENT '과당(g)',
  sugar_alcohol DECIMAL(14,6) DEFAULT NULL COMMENT '당알콜(g)',
  allulose DECIMAL(14,6) DEFAULT NULL COMMENT '알룰로오스(g)',
  lactose DECIMAL(14,6) DEFAULT NULL COMMENT '유당(g)',
  sucrose DECIMAL(14,6) DEFAULT NULL COMMENT '자당(g)',
  glucose DECIMAL(14,6) DEFAULT NULL COMMENT '포도당(g)',
  unsaturated_fatty_acid DECIMAL(14,6) DEFAULT NULL COMMENT '불포화지방산(g)',
  omega3_fatty_acid DECIMAL(14,6) DEFAULT NULL COMMENT '오메가3 지방산(g)',
  omega6_fatty_acid DECIMAL(14,6) DEFAULT NULL COMMENT '오메가6 지방산(g)',
  copper_ug DECIMAL(14,6) DEFAULT NULL COMMENT '구리(μg)',
  magnesium DECIMAL(14,6) DEFAULT NULL COMMENT '마그네슘(mg)',
  manganese DECIMAL(14,6) DEFAULT NULL COMMENT '망간(mg)',
  selenium DECIMAL(14,6) DEFAULT NULL COMMENT '셀레늄(μg)',
  zinc DECIMAL(14,6) DEFAULT NULL COMMENT '아연(mg)',
  chlorine DECIMAL(14,6) DEFAULT NULL COMMENT '염소(mg)',
  iodine DECIMAL(14,6) DEFAULT NULL COMMENT '요오드(μg)',
  chromium DECIMAL(14,6) DEFAULT NULL COMMENT '크롬(μg)',
  amino_acids DECIMAL(14,6) DEFAULT NULL COMMENT '아미노산(mg)',
  essential_amino_acids DECIMAL(14,6) DEFAULT NULL COMMENT '필수아미노산(mg)',
  nonessential_amino_acids DECIMAL(14,6) DEFAULT NULL COMMENT '비필수아미노산(mg)',
  glutamic_acid DECIMAL(14,6) DEFAULT NULL COMMENT '글루탐산(mg)',
  glycine DECIMAL(14,6) DEFAULT NULL COMMENT '글라이신(mg)',
  arginine DECIMAL(14,6) DEFAULT NULL COMMENT '아르기닌(mg)',
  taurine DECIMAL(14,6) DEFAULT NULL COMMENT '타우린(mg)',
  alcohol DECIMAL(14,6) DEFAULT NULL COMMENT '알코올(g)',
  caffeine DECIMAL(14,6) DEFAULT NULL COMMENT '카페인(mg)',

  source_code VARCHAR(30) DEFAULT NULL COMMENT '출처코드',
  source_name VARCHAR(200) DEFAULT NULL COMMENT '출처명',
  serving_reference VARCHAR(120) DEFAULT NULL COMMENT '1회 섭취참고량',
  daily_intake_count VARCHAR(50) DEFAULT NULL COMMENT '1일 섭취 횟수',
  serving_amount_weight VARCHAR(120) DEFAULT NULL COMMENT '1회분량 중량',
  food_weight VARCHAR(120) DEFAULT NULL COMMENT '식품 중량',
  manufacturer_name VARCHAR(200) DEFAULT NULL COMMENT '제조사명',
  importer_name VARCHAR(200) DEFAULT NULL COMMENT '수입업체명',
  distributor_name VARCHAR(200) DEFAULT NULL COMMENT '유통업체명',
  import_yn CHAR(1) DEFAULT NULL COMMENT '수입여부',
  country_of_origin_code VARCHAR(30) DEFAULT NULL COMMENT '원산지국코드',
  country_of_origin_name VARCHAR(200) DEFAULT NULL COMMENT '원산지국명',
  created_at DATE DEFAULT NULL COMMENT '데이터생성일자',
  base_at DATE DEFAULT NULL COMMENT '데이터기준일자',
  management_no VARCHAR(80) DEFAULT NULL COMMENT '관리번호(품목제조보고번호/수입식품관리번호)',

  PRIMARY KEY (food_code),
  KEY idx_food_name (food_name(191)),
  KEY idx_representative_food_name (representative_food_name(191)),
  KEY idx_energy (energy),
  KEY idx_data_type_code (data_type_code),
  CONSTRAINT chk_food_code_not_empty CHECK (food_code <> '')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='식품 영양정보 통합 마스터 (식품·건강기능식품·가공식품 공통 컬럼 기준)';

-- food_code 빈 값 자동 채움 (배치 INSERT 시 Duplicate entry '' 방지)
DROP TRIGGER IF EXISTS tr_bm_food_nutrition_before_insert;
CREATE TRIGGER tr_bm_food_nutrition_before_insert
BEFORE INSERT ON bm_food_nutrition
FOR EACH ROW
SET NEW.food_code = IF(TRIM(IFNULL(NEW.food_code, '')) = '', CONCAT('AUTO-', REPLACE(UUID(), '-', '')), NEW.food_code);


-- -----------------------------------------------------------------------------
-- 2. 식사 기록 (회원별 식사 occasion: 아침/점심/저녁/간식)
--    체중/혈압/혈당/생리주기와 동일하게 mb_id(회원 ID) 사용
-- -----------------------------------------------------------------------------
CREATE TABLE bm_food_records (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'PK',
  mb_id VARCHAR(50) NOT NULL COMMENT '회원 ID',
  record_date DATE NOT NULL COMMENT '식사 날짜',
  food_time ENUM('breakfast', 'lunch', 'dinner', 'snack') NOT NULL COMMENT '식사 구분(아침/점심/저녁/간식)',
  eaten_at TIME DEFAULT NULL COMMENT '실제 식사 시각',
  photo VARCHAR(500) DEFAULT NULL COMMENT '사진 URL',
  description TEXT COMMENT '메뉴 설명',
  calories INT DEFAULT NULL COMMENT '총 칼로리(kcal)',
  protein DECIMAL(5,2) DEFAULT NULL COMMENT '총 단백질(g)',
  carbs DECIMAL(5,2) DEFAULT NULL COMMENT '총 탄수화물(g)',
  fat DECIMAL(5,2) DEFAULT NULL COMMENT '총 지방(g)',
  other DECIMAL(10,2) DEFAULT NULL COMMENT '총 기타(g)',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '생성 시각',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '수정 시각',
  PRIMARY KEY (id),
  KEY idx_mb_id (mb_id),
  KEY idx_mb_id_record_date (mb_id, record_date),
  KEY idx_mb_id_record_date_time (mb_id, record_date, food_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='식사 기록 (회원별 식사 occasion)';


-- -----------------------------------------------------------------------------
-- 3. 식사별 섭취 음식 상세 (bm_food_nutrition 연동)
--    한 식사(id)에 여러 음식 추가 가능. food_code로 영양정보 참조
-- -----------------------------------------------------------------------------
CREATE TABLE bm_food_records_items (
  item_id INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'PK',
  food_record_id INT UNSIGNED NOT NULL COMMENT '식사 기록 ID (bm_food_records.id)',
  food_code VARCHAR(50) NOT NULL COMMENT '식품코드 (bm_food_nutrition.food_code)',
  food_name VARCHAR(200) DEFAULT NULL COMMENT '식품명 (스냅샷)',
  serving_quantity DECIMAL(10,2) NOT NULL DEFAULT 1.000 COMMENT '섭취 비율(1=기준량 100%, 0.5=50% 등)',
  kcal DECIMAL(10,2) DEFAULT NULL COMMENT '섭취 칼로리(kcal)',
  carbohydrate DECIMAL(10,2) DEFAULT NULL COMMENT '섭취 탄수화물(g)',
  protein DECIMAL(10,2) DEFAULT NULL COMMENT '섭취 단백질(g)',
  fat DECIMAL(10,2) DEFAULT NULL COMMENT '섭취 지방(g)',
  other DECIMAL(10,2) DEFAULT NULL COMMENT '섭취 기타(g)',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '생성 시각',

  PRIMARY KEY (item_id),
  KEY idx_food_record_id (food_record_id),
  KEY idx_food_code (food_code(50)),
  CONSTRAINT fk_food_records_items_record FOREIGN KEY (food_record_id) REFERENCES bm_food_records (id) ON DELETE CASCADE,
  CONSTRAINT fk_food_records_items_nutrition FOREIGN KEY (food_code) REFERENCES bm_food_nutrition (food_code) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='식사별 섭취 음식 상세 (bm_food_nutrition 연동)';


-- =============================================================================
-- FoodLens 연동용 식사 기록 DDL (항목 단위 영양 + food_id)
--
-- 주의: 프로젝트의 food_nutrition_ddl.sql 에는 bm_food_nutrition 연동형
--       bm_food_records / bm_food_records_items 가 이미 정의되어 있음.
--       운영 DB에서는 한 가지 모델만 선택하는 것을 권장 (중복 테이블 방지).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 식사 기록 헤더 (bm_food_record)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bm_food_record (
  food_record_id INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '식사 기록 ID',
  mb_id VARCHAR(50) NOT NULL COMMENT '회원 ID',
  meal_type VARCHAR(20) NOT NULL COMMENT '아침식사, 점심식사, 저녁식사, 간식',
  recorded_at DATETIME NOT NULL COMMENT '식사 기록 시간',
  total_calories DECIMAL(10,2) NOT NULL COMMENT '총 칼로리 (kcal)',
  image_path VARCHAR(255) DEFAULT NULL COMMENT '식사 사진 경로',
  notes TEXT COMMENT '메모',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '생성 시각',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '수정 시각',
  PRIMARY KEY (food_record_id),
  KEY idx_mb_id (mb_id),
  KEY idx_recorded_at (recorded_at),
  KEY idx_meal_type (meal_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='식사 기록 (FoodLens/수동 합산 헤더)';


-- -----------------------------------------------------------------------------
-- 2. 식사별 음식 항목 (bm_food_items)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bm_food_items (
  food_item_id INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '음식 항목 ID',
  food_record_id INT UNSIGNED NOT NULL COMMENT '식사 기록 ID (bm_food_record)',
  food_name VARCHAR(100) NOT NULL COMMENT '음식명',
  food_id INT DEFAULT NULL COMMENT 'FoodLens 음식 ID',
  calories DECIMAL(10,2) NOT NULL COMMENT '칼로리 (kcal)',
  carbs DECIMAL(10,2) DEFAULT NULL COMMENT '탄수화물 (g)',
  protein DECIMAL(10,2) DEFAULT NULL COMMENT '단백질 (g)',
  fat DECIMAL(10,2) DEFAULT NULL COMMENT '지방 (g)',
  sodium DECIMAL(10,2) DEFAULT NULL COMMENT '나트륨 (mg)',
  sugar DECIMAL(10,2) DEFAULT NULL COMMENT '당분 (g)',
  eat_amount DECIMAL(10,2) DEFAULT NULL COMMENT '섭취량',
  recognized_by_foodlens TINYINT(1) NOT NULL DEFAULT 0 COMMENT '0: 수동, 1: FoodLens',
  image_path VARCHAR(255) DEFAULT NULL COMMENT '음식 사진 경로',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '생성 시각',
  PRIMARY KEY (food_item_id),
  KEY idx_food_record_id (food_record_id),
  KEY idx_food_id (food_id),
  CONSTRAINT fk_food_items_record FOREIGN KEY (food_record_id)
    REFERENCES bm_food_record (food_record_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='식사별 음식 항목 (FoodLens)';
