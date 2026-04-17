-- =============================================================================
-- 체중 목표 설정 (초안 DDL) — 구현 전 검토용
--
-- 역할: "목표 체중·기간·주간 감량 목표" 등을 회원별로 보관.
--       실제 측정값은 bm_weight_records 에만 쌓이고, 목표는 여기서 조회해
--       그래프/달성률에 사용하는 구조가 단순함.
--
-- bomiora_member_health_profiles 와의 관계:
--   - 프로필에 '현재 키/기저 질환' 등 정적 정보, 목표는 자주 바뀔 수 있어 분리 권장.
--   - 프로필에 goal_weight 만 두고 싶다면 중복이 되므로, 한쪽만 SSOT 로 정할 것.
-- =============================================================================

CREATE TABLE IF NOT EXISTS bm_weight_goal (
  goal_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '목표 ID',
  mb_id VARCHAR(50) NOT NULL COMMENT '회원 ID',
  target_weight_kg DECIMAL(5,2) NOT NULL COMMENT '목표 체중 (kg)',
  start_weight_kg DECIMAL(5,2) DEFAULT NULL COMMENT '현재 체중 (목표 설정 시점의 시작 체중)',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '생성 일시',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '수정 일시',
  PRIMARY KEY (goal_id),
  KEY idx_mb_id (mb_id),
  KEY idx_mb_active (mb_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='체중 목표 설정 (초안)';

-- 필요 시: 회원당 활성 목표 1건만 허용하려면 애플리케이션에서 is_active 관리 또는
-- UNIQUE (mb_id) + 별도 이력 테이블(bm_weight_goal_history) 패턴을 고려.
