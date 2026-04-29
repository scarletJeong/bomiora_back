-- 찜 유형: prescription(처방상품) / general(일반상품) / content(콘텐츠, API body로 명시)
-- 적용 후 Node `insertWish`가 wi_it_kind를 채웁니다.

ALTER TABLE `bomiora_shop_wish`
  ADD COLUMN `wi_it_kind` VARCHAR(32) NOT NULL DEFAULT '' COMMENT '찜 유형 prescription|general|content' AFTER `it_id`;

-- 기존 행: 상품 마스터 기준으로 백필
UPDATE `bomiora_shop_wish` w
INNER JOIN `bomiora_shop_item_new` i ON i.it_id = w.it_id
SET w.wi_it_kind = IFNULL(NULLIF(TRIM(i.it_kind), ''), '')
WHERE TRIM(IFNULL(w.wi_it_kind, '')) = '';

UPDATE `bomiora_shop_wish` SET `wi_it_kind` = LOWER(TRIM(`wi_it_kind`));
