-- 식사 기록 다중 사진 (최대 3장, 첫 번째 = 대표사진)
-- MariaDB 10.2 미만은 JSON 타입 미지원 → TEXT에 JSON 문자열 저장
-- photo: 대표사진 URL (기존 단일 필드)
-- photos 예: ["/api/health/food/images/a.jpg","/api/health/food/images/b.jpg"]

ALTER TABLE bm_food_records
  ADD COLUMN photos TEXT NULL
  COMMENT '식사 사진 URL JSON 배열(최대 3, [0]=대표)'
  AFTER photo;

-- 기존 단일 photo → photos 배열로 이전
UPDATE bm_food_records
SET photos = CONCAT(
  '["',
  REPLACE(REPLACE(TRIM(photo), '\\', '\\\\'), '"', '\\"'),
  '"]'
)
WHERE photo IS NOT NULL
  AND TRIM(photo) <> ''
  AND (photos IS NULL OR TRIM(photos) = '');
