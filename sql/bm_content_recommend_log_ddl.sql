-- 콘텐츠 추천: 회원결제 예정 목록(문진 프로필 = pf_no, 없으면 0)당 글당 1회
-- 기존 DB에 `bm_content_recommend`만 있을 때: RENAME TABLE bm_content_recommend TO bm_content_recommend_log;
CREATE TABLE IF NOT EXISTS bm_content_recommend_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'PK',
  content_id BIGINT UNSIGNED NOT NULL COMMENT 'bm_content.id',
  mb_id VARCHAR(64) NOT NULL COMMENT '회원 ID',
  pf_no INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '문진/건강프로필 pf_no, 없으면 0',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_content_member_profile (content_id, mb_id, pf_no),
  KEY idx_cr_mb (mb_id),
  KEY idx_cr_content (content_id)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='콘텐츠 추천 이력(중복 방지)';



/*
콘텐츠 테이블
*/
CREATE TABLE `bm_content` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT COMMENT '콘텐츠 게시글 PK',
  `category` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '콘텐츠 카테고리',
  `thumbnail` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '대표 썸네일(선택)',
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '제목',
  `content` longtext COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '내용용(HTML: 텍스트+이미지 혼합)',
  `sort_order` int(11) NOT NULL DEFAULT '0' COMMENT '정렬순서(우선순위)',
  `is_notice` tinyint(1) NOT NULL DEFAULT '0' COMMENT '공지 등록 여부(1=공지)',
  `is_published` tinyint(1) NOT NULL DEFAULT '1' COMMENT '노출 여부(1=노출)',
  `view_count` int(10) unsigned NOT NULL DEFAULT '0' COMMENT '조회수',
  `recommend_count` int(10) unsigned NOT NULL DEFAULT '0' COMMENT '추천 수',
  `writer_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '작성자명',
  `created_by` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '등록자 ID',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '등록일',
  `updated_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '수정자 ID',
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '수정일',
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0' COMMENT '삭제 여부(1=삭제)',
  PRIMARY KEY (`id`),
  KEY `idx_content_deleted` (`is_deleted`),
  KEY `idx_content_category` (`category`),
  KEY `idx_content_notice` (`is_notice`,`created_at`),
  KEY `idx_content_publish` (`is_published`),
  KEY `idx_content_sort` (`sort_order`,`id`),
  KEY `idx_content_title_prefix` (`title`(191))
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='건강 콘텐츠 게시글';
-- 콘텐츠 추천수 (엄지업 API: POST /api/content/:id/recommend)
ALTER TABLE `bm_content`
  ADD COLUMN `recommend_count` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '추천 수' AFTER `view_count`;


