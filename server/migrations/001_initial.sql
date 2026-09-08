CREATE TABLE game_sessions (
  id TEXT PRIMARY KEY,
  student_hash TEXT NOT NULL,
  nickname TEXT NOT NULL CHECK (length(trim(nickname)) BETWEEN 1 AND 12),
  email_ciphertext TEXT NOT NULL,
  email_iv TEXT NOT NULL,
  email_auth_tag TEXT NOT NULL,
  phone_ciphertext TEXT NOT NULL,
  phone_iv TEXT NOT NULL,
  phone_auth_tag TEXT NOT NULL,
  privacy_consent_version TEXT NOT NULL,
  third_party_consent_version TEXT NOT NULL,
  consented_at_ms INTEGER NOT NULL,
  course_json TEXT NOT NULL,
  started_at_ms INTEGER NOT NULL,
  expires_at_ms INTEGER NOT NULL CHECK (expires_at_ms >= started_at_ms),
  completed_at_ms INTEGER CHECK (completed_at_ms IS NULL OR completed_at_ms >= started_at_ms),
  created_ip_hash TEXT NOT NULL
);

CREATE INDEX idx_game_sessions_student_hash ON game_sessions (student_hash);

CREATE TABLE game_records (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE REFERENCES game_sessions (id) ON DELETE CASCADE,
  student_hash TEXT NOT NULL,
  nickname TEXT NOT NULL,
  official_elapsed_ms INTEGER NOT NULL CHECK (official_elapsed_ms BETWEEN 5000 AND 600000),
  reported_elapsed_ms INTEGER NOT NULL CHECK (reported_elapsed_ms BETWEEN 0 AND 600000),
  typo_count INTEGER NOT NULL CHECK (typo_count >= 0),
  completed_at_ms INTEGER NOT NULL
);

CREATE INDEX idx_game_records_student_hash ON game_records (student_hash);
CREATE INDEX idx_game_records_official_elapsed_ms ON game_records (official_elapsed_ms);
CREATE INDEX idx_game_records_completed_at_ms ON game_records (completed_at_ms);
