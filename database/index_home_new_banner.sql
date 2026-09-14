-- 홈 신상품 4개 / 메인 배너 조회를 인덱스만 타게 함 (풀스캔·filesort 제거)
-- 한 번만 실행하면 됩니다.

ALTER TABLE bomiora_shop_item_new
  ADD INDEX idx_item_new_home (it_type3, it_use, it_order, it_id);

ALTER TABLE bomiora_shop_item_new
  ADD INDEX idx_item_best_home (it_type4, it_use, it_order, it_id);

ALTER TABLE bomiora_shop_item_new
  ADD INDEX idx_item_md_home (it_type5, it_use, it_kind, it_order, it_id);

ALTER TABLE bm_banner
  ADD INDEX idx_banner_active (placement, is_deleted, is_use, begin_time, end_time, sort_order);
