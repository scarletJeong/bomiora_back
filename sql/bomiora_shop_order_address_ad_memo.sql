-- 배송지 관리: 배송 요청사항
-- Flutter: adMemo / ad_memo

ALTER TABLE `bomiora_shop_order_address`
  ADD COLUMN `ad_memo` VARCHAR(255) NOT NULL DEFAULT '' COMMENT '배송 요청사항' AFTER `ad_jibeon`;
