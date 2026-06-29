-- bomiora_member_health_profiles: 운동 빈도(answer_10)와 운동 종목(answer_10_2) 분리
-- 앱(Flutter)은 answer102 / answer_10_2 로 전송합니다. 한 번만 실행하세요.

ALTER TABLE bomiora_member_health_profiles
  ADD COLUMN answer_10_2 VARCHAR(512) NULL DEFAULT NULL
  COMMENT '주로 하는 운동(종목)' AFTER answer_10;
