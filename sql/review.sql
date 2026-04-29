/**
 * 상품 전체 만족도(1~5) 추가
 */
ALTER TABLE bomiora_shop_item_use
  ADD COLUMN total_is_score TINYINT UNSIGNED NULL DEFAULT NULL COMMENT '상품만족도 1~5' AFTER is_score4;
