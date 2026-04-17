CREATE TABLE IF NOT EXISTS bm_notice (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '공지사항 PK',
  title VARCHAR(255) NOT NULL COMMENT '제목',
  content LONGTEXT NOT NULL COMMENT '내용',
  view_count INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '조회수',
  is_notice TINYINT(1) NOT NULL DEFAULT 0 COMMENT '상단 고정 공지 여부',
  writer_name VARCHAR(100) NOT NULL COMMENT '작성자명',
  created_by VARCHAR(100) NOT NULL COMMENT '등록자 ID',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '등록일',
  updated_by VARCHAR(100) DEFAULT NULL COMMENT '수정자 ID',
  updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '수정일',
  image_path VARCHAR(500) DEFAULT NULL COMMENT '대표 이미지 경로',
  is_deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '삭제 여부',
  PRIMARY KEY (id),
  KEY idx_notice_created_at (created_at),
  KEY idx_notice_deleted (is_deleted),
  KEY idx_notice_is_notice (is_notice),
  -- utf8mb4(최대 4바이트/문자) 환경에서 인덱스 길이 제한(767 bytes) 회피를 위해 prefix 인덱스 사용
  KEY idx_notice_search_title (title(191)),
  KEY idx_notice_search_writer (writer_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='공지사항';
