-- 1071 Specified key was too long 오류로 테이블 생성 실패 시
-- 1) 실패한 테이블이 있으면 삭제 후 재생성
-- 2) ALTER 컬럼은 이미 추가됐으면 ALTER 구문은 실행하지 마세요

DROP TABLE IF EXISTS `bomiora_member_fcm_token`;

CREATE TABLE `bomiora_member_fcm_token` (
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
