-- Ergänzung für bestehende Installationen – enthält keine Änderungen an Mitgliederdaten.
CREATE TABLE IF NOT EXISTS turnier (
  id INT NOT NULL AUTO_INCREMENT,
  daten LONGTEXT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
