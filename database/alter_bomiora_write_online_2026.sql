-- =============================================================================
-- bomiora_write_online (1:1 문의) 컬럼 정리
-- 실행 전 DB 백업 필수.
-- "Unknown column" / "Can't DROP" 오류 시 해당 줄은 이미 적용된 것.
-- =============================================================================

-- 1) 미사용 그누보드 기본 컬럼 제거
ALTER TABLE `bomiora_write_online`
  DROP COLUMN `wr_seo_title`,
  DROP COLUMN `wr_link1`,
  DROP COLUMN `wr_link2`,
  DROP COLUMN `wr_link1_hit`,
  DROP COLUMN `wr_link2_hit`,
  DROP COLUMN `wr_good`,
  DROP COLUMN `wr_nogood`,
  DROP COLUMN `wr_homepage`,
  DROP COLUMN `wr_facebook_user`,
  DROP COLUMN `wr_twitter_user`;

-- 2) 용도 COMMENT (컬럼명 wr_N 유지 — 그누보드·관리자 코드 호환)
ALTER TABLE `bomiora_write_online`
  MODIFY COLUMN `ca_name` VARCHAR(255) NOT NULL DEFAULT '' COMMENT '문의유형(대분류)',
  MODIFY COLUMN `wr_1` VARCHAR(255) NOT NULL DEFAULT '' COMMENT '웹 스킨 작성자명(레거시, wr_name과 중복 저장)',
  MODIFY COLUMN `wr_5` VARCHAR(255) NOT NULL DEFAULT '' COMMENT '휴대폰번호',
  MODIFY COLUMN `wr_6` VARCHAR(255) NOT NULL DEFAULT '' COMMENT '문의상세유형(가입,탈퇴 등)',
  MODIFY COLUMN `wr_7` TEXT NOT NULL COMMENT '관리자 답변 HTML',
  MODIFY COLUMN `wr_8` VARCHAR(500) NOT NULL DEFAULT '' COMMENT '관리자 답변 이미지 경로(data/qa/...)';

-- 1:1 문의 종료 플래그
-- 앱: PUT /api/contact/:wrId { wr_8: '1', is_closed: 1 }
-- wr_8 은 그누보드 여분필드(레거시 호환), is_closed 는 명시적 종료 컬럼

ALTER TABLE `bomiora_write_online`
  ADD COLUMN `is_closed` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '문의 종료(1=종료)' AFTER `wr_is_comment`;

-- 기존 wr_8='1' 데이터가 있으면 동기화
UPDATE `bomiora_write_online`
SET `is_closed` = 1
WHERE TRIM(`wr_8`) = '1';
