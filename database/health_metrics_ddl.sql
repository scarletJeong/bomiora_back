-- =============================================================================
-- 건강 모듈 - 체중 / 혈압 / 혈당 / 심박수 / 생리주기 / 걸음수(헬스연동) / 목표설정 이력 DDL
-- 회원 구분: mb_id VARCHAR(50) (food_nutrition_ddl.sql 과 동일)
-- 엔진/문자셋: InnoDB, utf8mb4_unicode_ci
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 체중 기록 (bm_weight_records)
--    Flutter: ApiEndpoints.weightRecords → /api/health/weight 계열
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bm_weight_records (
  record_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '기록 ID',
  mb_id VARCHAR(50) NOT NULL COMMENT '회원 ID',
  measured_at DATETIME NOT NULL COMMENT '측정 일시',
  weight DECIMAL(5,2) NOT NULL COMMENT '체중 (kg)',
  height DECIMAL(5,2) DEFAULT NULL COMMENT '키 (cm)',
  bmi DECIMAL(4,2) DEFAULT NULL COMMENT 'BMI (체질량지수)',
  notes TEXT COMMENT '메모',
  front_image_path VARCHAR(500) DEFAULT NULL COMMENT '정면 이미지 경로',
  side_image_path VARCHAR(500) DEFAULT NULL COMMENT '측면 이미지 경로',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '생성 일시',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '수정 일시',
  PRIMARY KEY (record_id),
  KEY idx_mb_measured (mb_id, measured_at DESC),
  KEY idx_mb_id (mb_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='체중 기록';


-- -----------------------------------------------------------------------------
-- 2. 혈압 기록 (bm_blood_pressure)
--    status: 앱/서버에서 수축기·이완기 기준으로 계산해 저장 (정상, 주의 등)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bm_blood_pressure (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '혈압 기록 ID',
  mb_id VARCHAR(50) NOT NULL COMMENT '회원 ID',
  systolic INT NOT NULL COMMENT '수축기 혈압 (mmHg)',
  diastolic INT NOT NULL COMMENT '이완기 혈압 (mmHg)',
  pulse INT DEFAULT NULL COMMENT '심박수 (bpm)',
  status VARCHAR(20) DEFAULT NULL COMMENT '혈압 상태 (정상, 주의, 고혈압 전단계, 고혈압 등)',
  measured_at DATETIME NOT NULL COMMENT '측정 일시 (사용자 입력)',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '입력 일시',
  updated_at DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '수정 일시',
  PRIMARY KEY (id),
  KEY idx_mb_id (mb_id),
  KEY idx_measured_at (measured_at),
  KEY idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='혈압 기록';


-- -----------------------------------------------------------------------------
-- 3. 혈당 기록 (bm_blood_sugar)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bm_blood_sugar (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '혈당 기록 ID',
  mb_id VARCHAR(50) NOT NULL COMMENT '회원 ID',
  blood_sugar INT NOT NULL COMMENT '혈당 수치 (mg/dL)',
  measurement_type VARCHAR(20) NOT NULL COMMENT '측정 유형 (공복, 식전, 식후, 취침전, 평상시)',
  status VARCHAR(20) DEFAULT NULL COMMENT '혈당 상태 (정상, 당뇨 전단계, 당뇨, 저혈당)',
  measured_at DATETIME NOT NULL COMMENT '측정 일시',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '입력 일시',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '수정 일시',
  PRIMARY KEY (id),
  KEY idx_mb_id (mb_id),
  KEY idx_measured_at (measured_at),
  KEY idx_mb_id_measured_at (mb_id, measured_at),
  KEY idx_measurement_type (measurement_type),
  KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='혈당 기록';


-- -----------------------------------------------------------------------------
-- 4. 심박수 기록 (bm_heart_rate)
--    Flutter: ApiEndpoints.heartRateRecords → /api/health/heart-rate
--    status: 운동 / 일상 (혈압 입력 시 동기화되는 심박수는 반드시 '일상'으로 저장)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bm_heart_rate (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '심박수 기록 ID',
  mb_id VARCHAR(50) NOT NULL COMMENT '회원 ID',
  heart_rate INT NOT NULL COMMENT '심박수 (bpm)',
  status VARCHAR(20) NOT NULL DEFAULT '일상' COMMENT '상태 (운동, 일상)',
  measured_at DATETIME NOT NULL COMMENT '측정 일시',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '생성 일시',
  source_type VARCHAR(30) NOT NULL DEFAULT 'health_sync' COMMENT '데이터 출처 유형 (health_sync, blood_pressure)',
  source_record_id BIGINT UNSIGNED DEFAULT NULL COMMENT '출처 원본 기록 ID (예: 혈압 id, uk와 함께 중복 방지)',
  PRIMARY KEY (id),
  UNIQUE KEY uk_bm_heart_rate_source (source_type, source_record_id),
  KEY idx_bm_heart_rate_mb_id_measured_at (mb_id, measured_at),
  KEY idx_bm_heart_rate_source_record_id (source_record_id),
  KEY idx_bm_heart_rate_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='심박수 기록';

-- 기존 bm_heart_rate 테이블에 status 컬럼만 추가할 때 (이미 테이블이 있는 경우):
-- ALTER TABLE bm_heart_rate
--   ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT '일상' COMMENT '측정 맥락 (운동, 일상)' AFTER measured_at,
--   ADD KEY idx_bm_heart_rate_status (status);


-- -----------------------------------------------------------------------------
-- 5. 생리주기 설정/기록 (bm_menstrual_cycle)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bm_menstrual_cycle (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '기본키',
  mb_id VARCHAR(50) NOT NULL COMMENT '회원 ID',
  last_period_start DATE NOT NULL COMMENT '마지막 생리 시작일',
  cycle_length INT NOT NULL COMMENT '생리주기 길이 (일)',
  period_length INT NOT NULL COMMENT '생리 기간 길이 (일)',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '생성일시',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '수정일시',
  PRIMARY KEY (id),
  KEY idx_mb_id (mb_id),
  KEY idx_last_period_start (last_period_start),
  KEY idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='생리주기 기록';


-- -----------------------------------------------------------------------------
-- 6. 걸음수 (헬스 연동) — bm_steps
--    Apple Health / Google Health Connect / Samsung Health 공통으로 제공하는
--    「구간 시작·종료 시각 + 해당 구간 걸음 수」만 저장 (필수 항목 최소화).
--    provider: 앱에서 apple_health | google_health_connect | samsung_health 등으로 통일.
--    external_uid: 플랫폼이 주는 샘플/레코드 식별자가 있으면 중복 적재 방지용 (없으면 NULL).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bm_steps (
  record_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '기록 ID',
  mb_id VARCHAR(50) NOT NULL COMMENT '회원 ID',
  steps INT UNSIGNED NOT NULL COMMENT '해당 시간 구간의 걸음 수 (걸음)',
  interval_start DATETIME NOT NULL COMMENT '집계 구간 시작 일시 (원본 타임존 기준으로 앱에서 정규화 후 저장 권장)',
  interval_end DATETIME NOT NULL COMMENT '집계 구간 종료 일시',
  provider VARCHAR(32) NOT NULL COMMENT '연동 출처 (apple_health, google_health, samsung_health)',
  external_uid VARCHAR(191) DEFAULT NULL COMMENT '플랫폼 원본 레코드/샘플 UID (있을 때만)',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '서버 적재 일시',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '수정 일시',
  PRIMARY KEY (record_id),
  KEY idx_bm_steps_mb_interval (mb_id, interval_start DESC),
  KEY idx_bm_steps_mb_end (mb_id, interval_end DESC),
  KEY idx_bm_steps_provider (mb_id, provider),
  KEY idx_bm_steps_external (mb_id, provider, external_uid),
  UNIQUE KEY uk_bm_steps_window (mb_id, provider, interval_start, interval_end)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='걸음수 기록 (애플/구글/삼성 헬스 연동)';

-- 동일 회원·동일 연동처·동일 [interval_start, interval_end] 는 1행만 유지 (재동기화 시 INSERT ... ON DUPLICATE KEY UPDATE 등).


-- -----------------------------------------------------------------------------
-- 7. 목표설정 (bm_health_goal_records) — mb_id 당 1행만 유지
--    Flutter: health_goal_screen.dart — 현재 체중, 목표 체중, 하루 걸음 수(목표)
--    · UNIQUE(mb_id) 로 회원당 단일 행. 저장 시 INSERT … ON DUPLICATE KEY UPDATE (UPSERT).
--    · API/서버: 동일 트랜잭션에서
--        (1) bm_weight_records 에 현재 체중 1건 INSERT
--        (2) 아래 테이블 UPSERT — weight_record_id 는 (1)에서 생성된 record_id
--    · daily_step_goal 은 헬스연동 실측(bm_steps)과 별개인 「일일 목표 걸음 수」.
--    · 기존 DB에 이력이 여러 행이면: database/migrations/bm_health_goal_one_row_per_mb.sql 적용 후 UNIQUE 추가.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bm_health_goal_records (
  goal_record_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '목표설정 PK',
  mb_id VARCHAR(50) NOT NULL COMMENT '회원 ID',
  current_weight DECIMAL(5,2) NOT NULL COMMENT '저장 시점 현재 체중 (kg)',
  target_weight DECIMAL(5,2) NOT NULL COMMENT '목표 체중 (kg)',
  daily_step_goal INT UNSIGNED NOT NULL COMMENT '하루 목표 걸음 수',
  weight_record_id BIGINT UNSIGNED DEFAULT NULL COMMENT '함께 적재한 bm_weight_records.record_id',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '최초 등록 일시',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '마지막 수정 일시',
  PRIMARY KEY (goal_record_id),
  UNIQUE KEY uk_bm_health_goal_mb_id (mb_id),
  KEY idx_bm_health_goal_weight_ref (weight_record_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='회원당 1건 목표설정 (현재/목표 체중, 일일 목표 걸음)';

-- 조회 예시:
--   SELECT * FROM bm_health_goal_records WHERE mb_id = ? LIMIT 1;


