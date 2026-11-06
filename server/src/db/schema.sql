-- Employee Leave Management System schema.
-- Written in portable SQL (standard types, explicit timestamps set by the app)
-- so it can move to PostgreSQL/MySQL with minimal changes
-- (INTEGER PRIMARY KEY AUTOINCREMENT -> SERIAL/IDENTITY).

CREATE TABLE IF NOT EXISTS departments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS users (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT    NOT NULL,
  email          TEXT    NOT NULL UNIQUE,
  password_hash  TEXT    NOT NULL,
  role           TEXT    NOT NULL CHECK (role IN ('EMPLOYEE', 'MANAGER', 'HOD')),
  department_id  INTEGER NOT NULL REFERENCES departments(id),
  manager_id     INTEGER REFERENCES users(id),          -- reporting manager (NULL for HOD)
  email_verified_at TEXT,                               -- NULL until the email code is confirmed
  created_at     TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_department ON users(department_id, role);
CREATE INDEX IF NOT EXISTS idx_users_manager    ON users(manager_id);

CREATE TABLE IF NOT EXISTS leave_requests (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id          INTEGER NOT NULL REFERENCES users(id),
  leave_type           TEXT    NOT NULL CHECK (leave_type IN ('CASUAL', 'SICK', 'EARNED', 'UNPAID')),
  from_date            TEXT    NOT NULL,                -- ISO date YYYY-MM-DD
  to_date              TEXT    NOT NULL,
  working_days         REAL    NOT NULL CHECK (working_days > 0),
  day_part             TEXT    NOT NULL DEFAULT 'FULL' CHECK (day_part IN ('FULL', 'FIRST_HALF', 'SECOND_HALF')),
  reason               TEXT    NOT NULL,
  status               TEXT    NOT NULL CHECK (status IN ('PENDING', 'INFO_REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED')),
  current_stage        TEXT    CHECK (current_stage IN ('MANAGER', 'HOD')),
  requires_documents   INTEGER NOT NULL DEFAULT 0,      -- 1 when > 3 working days
  manager_approver_id  INTEGER REFERENCES users(id),    -- level 1 approver (snapshot at submission)
  hod_approver_id      INTEGER REFERENCES users(id),    -- level 2 approver (only for long leave)
  created_at           TEXT    NOT NULL,
  updated_at           TEXT    NOT NULL,
  CHECK (to_date >= from_date)
);

CREATE INDEX IF NOT EXISTS idx_leave_employee ON leave_requests(employee_id, from_date);
CREATE INDEX IF NOT EXISTS idx_leave_queue    ON leave_requests(status, current_stage);

-- Per-request timeline: every workflow step with the actor and comment.
CREATE TABLE IF NOT EXISTS leave_actions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  leave_id    INTEGER NOT NULL REFERENCES leave_requests(id) ON DELETE CASCADE,
  actor_id    INTEGER NOT NULL REFERENCES users(id),
  action      TEXT    NOT NULL,   -- SUBMITTED, APPROVED, REJECTED, INFO_REQUESTED, INFO_PROVIDED, UPDATED, CANCELLED, DOCUMENTS_ADDED
  stage       TEXT,
  comment     TEXT,
  created_at  TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_actions_leave ON leave_actions(leave_id, id);

CREATE TABLE IF NOT EXISTS documents (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  leave_id       INTEGER NOT NULL REFERENCES leave_requests(id) ON DELETE CASCADE,
  uploaded_by    INTEGER NOT NULL REFERENCES users(id),
  original_name  TEXT    NOT NULL,
  stored_name    TEXT    NOT NULL UNIQUE,              -- random name on disk, never user-controlled
  mime_type      TEXT    NOT NULL,
  size_bytes     INTEGER NOT NULL,
  created_at     TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_documents_leave ON documents(leave_id);

-- System-wide audit trail (logins, workflow changes, document access).
CREATE TABLE IF NOT EXISTS audit_logs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id     INTEGER REFERENCES users(id),
  actor_email  TEXT,
  action       TEXT    NOT NULL,
  entity_type  TEXT,
  entity_id    INTEGER,
  details      TEXT,               -- JSON
  ip_address   TEXT,
  created_at   TEXT    NOT NULL,
  prev_hash    TEXT    NOT NULL,   -- row_hash of the previous entry (hash chain)
  row_hash     TEXT    NOT NULL    -- SHA-256(prev_hash + this row's content): edits break the chain
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_entity  ON audit_logs(entity_type, entity_id);

-- Audit logs are append-only: the database itself refuses edits and deletes.
CREATE TRIGGER IF NOT EXISTS trg_audit_no_update BEFORE UPDATE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'audit_logs is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_audit_no_delete BEFORE DELETE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'audit_logs is append-only');
END;


-- =====================================================================
-- [auth] sign-up + email verification. OWNER: Claude. Add tables below.
-- =====================================================================

-- One active 6-digit code per unverified user. Only a hash of the code is stored.
CREATE TABLE IF NOT EXISTS email_verifications (
  user_id       INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  code_hash     TEXT    NOT NULL,
  expires_at    TEXT    NOT NULL,
  attempts      INTEGER NOT NULL DEFAULT 0,
  last_sent_at  TEXT    NOT NULL
);


-- end [auth]


-- =====================================================================
-- [balances & holidays & half-day]. OWNER: Codex. Add tables below.
-- =====================================================================

CREATE TABLE IF NOT EXISTS holidays (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  holiday_date TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  created_by   INTEGER REFERENCES users(id),
  created_at   TEXT NOT NULL
);


-- end [balances & holidays & half-day]


-- =====================================================================
-- [notifications]. OWNER: Copilot. Add tables below.
-- =====================================================================

CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  leave_id   INTEGER REFERENCES leave_requests(id) ON DELETE CASCADE,
  type       TEXT    NOT NULL,
  title      TEXT    NOT NULL,
  message    TEXT    NOT NULL,
  is_read    INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
  created_at TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read);

-- end [notifications]
