-- 상품 검색: 판매중/종류/목록노출/카테고리로 먼저 좁힌 뒤 상품명을 비교
-- 한 번만 실행하면 됩니다. 같은 이름의 인덱스가 있으면 실행하지 마세요.

ALTER TABLE bomiora_shop_item_new
  ADD INDEX idx_item_search_filter (it_use, it_kind, it_nolist, ca_id);
