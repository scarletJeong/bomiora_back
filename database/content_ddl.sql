CREATE TABLE IF NOT EXISTS bm_content (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '콘텐츠 게시글 PK',
  category VARCHAR(50) NOT NULL COMMENT '콘텐츠 카테고리',
  thumbnail VARCHAR(500) DEFAULT NULL COMMENT '대표 썸네일(선택)',
  title VARCHAR(255) NOT NULL COMMENT '제목',
  content LONGTEXT NOT NULL COMMENT '내용용(HTML: 텍스트+이미지 혼합)',
  sort_order INT NOT NULL DEFAULT 0 COMMENT '정렬순서(우선순위)',
  is_notice TINYINT(1) NOT NULL DEFAULT 0 COMMENT '공지 등록 여부(1=공지)',
  is_published TINYINT(1) NOT NULL DEFAULT 1 COMMENT '노출 여부(1=노출)',
  view_count INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '조회수',
  writer_name VARCHAR(100) NOT NULL COMMENT '작성자명',
  created_by VARCHAR(100) NOT NULL COMMENT '등록자 ID',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '등록일',
  updated_by VARCHAR(100) DEFAULT NULL COMMENT '수정자 ID',
  updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '수정일',
  is_deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '삭제 여부(1=삭제)',
  PRIMARY KEY (id),
  KEY idx_content_deleted (is_deleted),
  KEY idx_content_category (category),
  KEY idx_content_notice (is_notice, created_at),
  KEY idx_content_publish (is_published),
  KEY idx_content_sort (sort_order, id),
  KEY idx_content_title_prefix (title(191))
) ENGINE=InnoDB 
  DEFAULT CHARSET=utf8mb4 
  COLLATE=utf8mb4_unicode_ci 
  COMMENT='건강 콘텐츠 게시글';
