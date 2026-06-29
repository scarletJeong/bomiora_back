-- 환불계좌 (은행명 / 계좌번호 / 예금주)
-- Node: GET/PUT `/api/user/refund-account`

ALTER TABLE `bomiora_member`
  ADD COLUMN `mb_refund_bank` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '환불계좌 은행' AFTER `profile_img`,
  ADD COLUMN `mb_refund_account` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '환불계좌 번호(숫자만 저장 권장)' AFTER `mb_refund_bank`,
  ADD COLUMN `mb_refund_holder` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '환불계좌 예금주' AFTER `mb_refund_account`;
