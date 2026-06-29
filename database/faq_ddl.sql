CREATE TABLE IF NOT EXISTS bm_faq (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'FAQ PK',
  category VARCHAR(50) NOT NULL COMMENT 'FAQ 카테고리',
  question VARCHAR(500) NOT NULL COMMENT '질문',
  answer LONGTEXT NOT NULL COMMENT '답변',
  view_count INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '조회수',
  sort_order INT NOT NULL DEFAULT 0 COMMENT '정렬순서',
  writer_name VARCHAR(100) NOT NULL COMMENT '작성자명',
  created_by VARCHAR(100) NOT NULL COMMENT '등록자 ID',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '등록일',
  updated_by VARCHAR(100) DEFAULT NULL COMMENT '수정자 ID',
  updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '수정일',
  is_deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '삭제 여부',
  PRIMARY KEY (id),
  KEY idx_faq_deleted (is_deleted),
  KEY idx_faq_category (category),
  KEY idx_faq_sort (sort_order, id),
  KEY idx_faq_question_prefix (question(191))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='FAQ';
