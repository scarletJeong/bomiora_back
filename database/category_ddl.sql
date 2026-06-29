CREATE TABLE IF NOT EXISTS bm_category (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '카테고리 PK',
  grp VARCHAR(50) NOT NULL COMMENT '카테고리 그룹 (예: faq)',
  category_name VARCHAR(100) NOT NULL COMMENT '카테고리명',
  is_use TINYINT(1) NOT NULL DEFAULT 1 COMMENT '사용 여부',
  created_by VARCHAR(100) NOT NULL COMMENT '등록자',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '등록일',
  updated_by VARCHAR(100) DEFAULT NULL COMMENT '수정자',
  updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '수정일',
  is_deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '삭제 여부',
  PRIMARY KEY (id),
  KEY idx_category_grp (grp),
  KEY idx_category_use (is_use),
  KEY idx_category_deleted (is_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='공통 카테고리';
