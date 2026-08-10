-- 장바구니 본품/추가상품 관계 분리: parent 컬럼
-- parent = 부모 상품 it_id (본품이면 빈 문자열)
-- ct_kind = prescription | general (상품 종류, supply_add| 인코딩 제거)

ALTER TABLE bomiora_shop_cart
  ADD COLUMN parent varchar(32) NOT NULL DEFAULT '' AFTER ct_kind;

