-- bomiora_shop_health_profiles_cart 문진 답변 컬럼을 질문 순서로 모은다.
-- 값은 그대로 두고 위치만 바꾼다. 실행 전 백업.
-- 결과 순서:
--   answer_1 .. answer_7, answer_7_1, answer_8, answer_9,
--   answer_10, answer_10_2, answer_11, answer_12,
--   answer_13, answer_13_period, answer_13_dosage, answer_13_medicine, answer_13_sideeffect
--   그 다음 hp_* 

ALTER TABLE `bomiora_shop_health_profiles_cart`
  MODIFY COLUMN `answer_7_1` varchar(100) DEFAULT '' COMMENT '식사시간' AFTER `answer_7`;

ALTER TABLE `bomiora_shop_health_profiles_cart`
  MODIFY COLUMN `answer_10_2` varchar(512) DEFAULT NULL COMMENT '주로 하는 운동(종목)' AFTER `answer_10`;

ALTER TABLE `bomiora_shop_health_profiles_cart`
  MODIFY COLUMN `answer_13` varchar(255) DEFAULT NULL COMMENT '기존 다이어트 복용약 여부' AFTER `answer_12`;

ALTER TABLE `bomiora_shop_health_profiles_cart`
  MODIFY COLUMN `answer_13_period` varchar(100) DEFAULT '' COMMENT '다이어트약 복용기간' AFTER `answer_13`;

ALTER TABLE `bomiora_shop_health_profiles_cart`
  MODIFY COLUMN `answer_13_dosage` varchar(100) DEFAULT '' COMMENT '다이어트약 복용횟수' AFTER `answer_13_period`;

ALTER TABLE `bomiora_shop_health_profiles_cart`
  MODIFY COLUMN `answer_13_medicine` varchar(200) DEFAULT '' COMMENT '복용한 다이어트약명' AFTER `answer_13_dosage`;

ALTER TABLE `bomiora_shop_health_profiles_cart`
  MODIFY COLUMN `answer_13_sideeffect` varchar(100) DEFAULT '' COMMENT '부작용(불편했던점)' AFTER `answer_13_medicine`;
