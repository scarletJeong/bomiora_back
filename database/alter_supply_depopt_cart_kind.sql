-- 종속선택옵션 · 연결상품 / 장바구니 묶음 지원

-- 1) ct_kind: enum이면 supply_add|{부모it_id} 저장이 잘림
ALTER TABLE bomiora_shop_cart
  MODIFY ct_kind varchar(64) NOT NULL DEFAULT 'general';

-- 2) 상품 테이블 (Node는 bomiora_shop_item_new 사용)
-- 컬럼이 이미 있으면면 에러 → 무시하거나 기동 시 ensureSchema 사용

ALTER TABLE bomiora_shop_item_new
  ADD COLUMN it_supply_items varchar(255) NOT NULL DEFAULT '' AFTER it_supply_subject;

ALTER TABLE bomiora_shop_item_new
  ADD COLUMN it_depopt1_subject varchar(255) NOT NULL DEFAULT '' AFTER it_supply_items,
  ADD COLUMN it_depopt1_label varchar(100) NOT NULL DEFAULT '' AFTER it_depopt1_subject,
  ADD COLUMN it_depopt2_subject varchar(255) NOT NULL DEFAULT '' AFTER it_depopt1_label,
  ADD COLUMN it_depopt2_label varchar(100) NOT NULL DEFAULT '' AFTER it_depopt2_subject;
