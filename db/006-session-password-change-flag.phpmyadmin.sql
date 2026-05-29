ALTER TABLE app_session ADD COLUMN password_change_required TINYINT(1) NOT NULL DEFAULT 0 AFTER user_id;
