-- FCM 토큰 · 알림 수신 설정
-- Node: POST `/api/user/fcm-token`, GET/PUT `/api/user/notification-settings`
-- (컬럼이 이미 있으면 ALTER는 건너뛰고 CREATE TABLE만 실행)

ALTER TABLE `bomiora_member`
  ADD COLUMN `mb_notif_order` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '주문 정보 알림' AFTER `mb_refund_holder`,
  ADD COLUMN `mb_notif_marketing` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '마케팅 수신 동의' AFTER `mb_notif_order`,
  ADD COLUMN `mb_notif_app_push` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '앱 푸시 수신' AFTER `mb_notif_marketing`,
  ADD COLUMN `mb_notif_sms` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'SMS 수신' AFTER `mb_notif_app_push`;

-- utf8mb4 UNIQUE 인덱스 최대 767bytes → fcm_token 전체 UNIQUE 불가
-- SHA256 해시(64자)로 유니크 보장
CREATE TABLE IF NOT EXISTS `bomiora_member_fcm_token` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `mb_id` VARCHAR(50) NOT NULL COMMENT '회원 ID',
  `fcm_token` VARCHAR(512) NOT NULL COMMENT 'FCM 등록 토큰',
  `fcm_token_hash` CHAR(64) NOT NULL COMMENT 'SHA256(fcm_token)',
  `platform` VARCHAR(16) NOT NULL DEFAULT 'android' COMMENT 'android|ios|web',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_fcm_token_hash` (`fcm_token_hash`),
  KEY `idx_mb_id` (`mb_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='회원 FCM 디바이스 토큰';
