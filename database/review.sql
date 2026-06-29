/**
 * 상품 전체 만족도(0.1~5) — 소수 저장 필요 시 review_total_score_decimal.sql 실행
 */
ALTER TABLE bomiora_shop_item_use
  ADD COLUMN total_is_score DECIMAL(3,1) NULL DEFAULT NULL COMMENT '상품만족도 0.1~5' AFTER is_score4;
