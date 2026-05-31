CREATE TABLE mitglied_aenderung (
  id BIGINT NOT NULL AUTO_INCREMENT,
  mitglied_id INT NOT NULL,
  aktion VARCHAR(40) NOT NULL,
  geaendert_am TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  geaendert_von_user_id INT NULL,
  geaendert_von_name VARCHAR(80) NOT NULL,
  aenderungen_json LONGTEXT NOT NULL,
  PRIMARY KEY (id),
  INDEX idx_mitglied_aenderung_mitglied_id (mitglied_id),
  INDEX idx_mitglied_aenderung_geaendert_am (geaendert_am),
  CONSTRAINT fk_mitglied_aenderung_user
    FOREIGN KEY (geaendert_von_user_id) REFERENCES app_user (id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
