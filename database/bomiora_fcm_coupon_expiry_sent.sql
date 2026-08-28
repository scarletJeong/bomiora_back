-- 쿠폰 만료 하루 전 푸시 중복 방지 (잡 실행 시 CREATE TABLE IF NOT EXISTS 로도 생성됨)
CREATE TABLE IF NOT EXISTS bomiora_fcm_coupon_expiry_sent (
  cp_id VARCHAR(100) NOT NULL,
  mb_id VARCHAR(20) NOT NULL,
  cp_end DATE NOT NULL,
  sent_at DATETIME NOT NULL,
  PRIMARY KEY (cp_id, mb_id, cp_end)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
