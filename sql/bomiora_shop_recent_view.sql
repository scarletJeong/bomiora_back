-- 최근 본 상품 (회원별 상품 조회 이력)
CREATE TABLE IF NOT EXISTS bomiora_shop_recent_view (
  rv_id INT AUTO_INCREMENT PRIMARY KEY,
  mb_id VARCHAR(64) NOT NULL,
  it_id VARCHAR(20) NOT NULL,
  it_kind VARCHAR(20) DEFAULT '' COMMENT 'prescription / general',
  rv_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  rv_ip VARCHAR(50) DEFAULT NULL,
  UNIQUE KEY uk_mb_it (mb_id, it_id),
  KEY idx_mb_time (mb_id, rv_time DESC)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='최근 본 상품';
