--liquibase formatted sql

--changeset codex:001-create-member-schema dbms:mysql
CREATE TABLE seniorenclub (
  id INT NOT NULL,
  name VARCHAR(120) NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE austrittsgrund (
  id INT NOT NULL,
  bezeichnung VARCHAR(80) NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE interessengruppe (
  id INT NOT NULL,
  bezeichnung VARCHAR(120) NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE funktion (
  id INT NOT NULL,
  bezeichnung VARCHAR(120) NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE mitglied (
  id INT NOT NULL,
  name VARCHAR(120) NOT NULL,
  vorname VARCHAR(120) NOT NULL,
  geschlecht ENUM('m', 'w') NOT NULL DEFAULT 'w',
  passbild VARCHAR(500) NULL,
  strasse VARCHAR(200) NOT NULL DEFAULT '',
  plz VARCHAR(12) NOT NULL DEFAULT '',
  ort VARCHAR(120) NOT NULL DEFAULT 'Berlin',
  telefon VARCHAR(80) NOT NULL DEFAULT '',
  handy VARCHAR(80) NOT NULL DEFAULT '',
  email VARCHAR(254) NOT NULL DEFAULT '',
  geburtstag DATE NULL,
  eintrittsdatum DATE NULL,
  austrittsdatum DATE NULL,
  austrittsgrund_id INT NULL,
  gruppenwahl VARCHAR(500) NOT NULL DEFAULT '',
  funktion_rohdaten VARCHAR(500) NOT NULL DEFAULT '',
  auswahl TINYINT(1) NOT NULL DEFAULT 0,
  ausweis_erteilt TINYINT(1) NOT NULL DEFAULT 0,
  clubzugehoerigkeit_id INT NULL,
  weihnachtsessen TINYINT NOT NULL DEFAULT 0,
  wn_essen_bezahlt TINYINT(1) NOT NULL DEFAULT 0,
  beitrag_club_bezahlt TINYINT(1) NOT NULL DEFAULT 0,
  betrag_club_bar DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  beitrag_computer_bezahlt TINYINT(1) NOT NULL DEFAULT 0,
  betrag_computer_bar DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  preis_club DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  gezahlter_betrag_club DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  einzahlung_club_am DATE NULL,
  preis_computer DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  gezahlter_betrag_computer DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  einzahlung_computer_am DATE NULL,
  preis_weihnachten DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  gezahlter_betrag_weihnachten DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  bemerkung TEXT NULL,
  tischnummer INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_mitglied_austrittsgrund
    FOREIGN KEY (austrittsgrund_id) REFERENCES austrittsgrund (id),
  CONSTRAINT fk_mitglied_seniorenclub
    FOREIGN KEY (clubzugehoerigkeit_id) REFERENCES seniorenclub (id),
  CONSTRAINT chk_mitglied_weihnachtsessen
    CHECK (weihnachtsessen IN (0, 1, 2))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE mitglied_interessengruppe (
  mitglied_id INT NOT NULL,
  interessengruppe_id INT NOT NULL,
  PRIMARY KEY (mitglied_id, interessengruppe_id),
  CONSTRAINT fk_mitglied_interessengruppe_mitglied
    FOREIGN KEY (mitglied_id) REFERENCES mitglied (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_mitglied_interessengruppe_gruppe
    FOREIGN KEY (interessengruppe_id) REFERENCES interessengruppe (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE mitglied_funktion (
  mitglied_id INT NOT NULL,
  funktion_id INT NOT NULL,
  PRIMARY KEY (mitglied_id, funktion_id),
  CONSTRAINT fk_mitglied_funktion_mitglied
    FOREIGN KEY (mitglied_id) REFERENCES mitglied (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_mitglied_funktion_funktion
    FOREIGN KEY (funktion_id) REFERENCES funktion (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE mitglied_passbild (
  mitglied_id INT NOT NULL,
  dateiname VARCHAR(255) NOT NULL,
  mime_type VARCHAR(80) NOT NULL,
  groesse_bytes INT UNSIGNED NULL,
  sha256 CHAR(64) NULL,
  inhalt MEDIUMBLOB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (mitglied_id),
  CONSTRAINT fk_mitglied_passbild_mitglied
    FOREIGN KEY (mitglied_id) REFERENCES mitglied (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_mitglied_name ON mitglied (name, vorname);
CREATE INDEX idx_mitglied_geburtstag ON mitglied (geburtstag);
CREATE INDEX idx_mitglied_austritt ON mitglied (austrittsdatum, austrittsgrund_id);
CREATE INDEX idx_mitglied_club ON mitglied (clubzugehoerigkeit_id);
CREATE INDEX idx_mitglied_passbild_sha256 ON mitglied_passbild (sha256);

--rollback DROP TABLE mitglied_passbild;
--rollback DROP TABLE mitglied_funktion;
--rollback DROP TABLE mitglied_interessengruppe;
--rollback DROP TABLE mitglied;
--rollback DROP TABLE funktion;
--rollback DROP TABLE interessengruppe;
--rollback DROP TABLE austrittsgrund;
--rollback DROP TABLE seniorenclub;

--changeset codex:002-seed-reference-data dbms:mysql
INSERT INTO seniorenclub (id, name) VALUES
  (1, 'FZST Heiligensee'),
  (2, 'FZST Tegel'),
  (3, 'FZST Hermsdorf'),
  (4, 'FZST Schäfersee'),
  (5, 'FZST Märkischer Seniorentreff'),
  (6, 'FZST Club der Lebensfrohen'),
  (7, 'FZST Adelheidallee'),
  (8, 'Gäste'),
  (9, 'Lübars');

INSERT INTO austrittsgrund (id, bezeichnung) VALUES
  (1, ''),
  (2, 'Tod'),
  (3, 'Kündigung'),
  (4, 'Umzug'),
  (5, 'Altenheim'),
  (6, 'anderer Club'),
  (7, 'ohne'),
  (8, 'Gesundheit');

INSERT INTO interessengruppe (id, bezeichnung) VALUES
  (1, 'Allgemein'),
  (2, 'Gymnastik'),
  (3, 'Kreativ'),
  (4, 'Computer'),
  (5, 'Kartenspiel'),
  (6, 'Englisch'),
  (7, 'Zeitlosen'),
  (8, 'Tischtennis 1'),
  (9, 'Schach'),
  (10, 'Smartphone Apple'),
  (11, 'Laufgruppe'),
  (15, 'Tischtennis 2'),
  (16, 'Excel'),
  (17, 'WinSoft'),
  (18, 'Smartphone Android'),
  (19, 'Video'),
  (20, 'Publisher'),
  (21, 'PC im Alltag'),
  (22, 'Grundlagen'),
  (23, 'Senioren-Skat'),
  (24, 'Gesprächskreis Aktuelles'),
  (26, 'Tischtennis 3');

INSERT INTO funktion (id, bezeichnung) VALUES
  (1, 'Vorstand'),
  (2, 'Kassierer'),
  (3, 'Gruppenleiter'),
  (4, 'Gruppenleiter stellv.'),
  (5, 'Ersthelfer'),
  (6, 'Brandschutzbeauftragter'),
  (7, 'Rote Karte');

--rollback DELETE FROM funktion WHERE id IN (1, 2, 3, 4, 5, 6, 7);
--rollback DELETE FROM interessengruppe WHERE id IN (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 26);
--rollback DELETE FROM austrittsgrund WHERE id IN (1, 2, 3, 4, 5, 6, 7, 8);
--rollback DELETE FROM seniorenclub WHERE id IN (1, 2, 3, 4, 5, 6, 7, 8, 9);

--changeset codex:003-create-app-users dbms:mysql
CREATE TABLE app_user (
  id INT NOT NULL AUTO_INCREMENT,
  username VARCHAR(80) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(40) NOT NULL DEFAULT 'admin',
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_app_user_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO app_user (username, password_hash, role, active) VALUES
  ('admin', '$2y$12$YkkU2/LjJREX65IJuOv./uJOtLmDnXjrE9lxEZ/jBqvHV66PU5rVq', 'admin', 1);

--rollback DROP TABLE app_user;

--changeset codex:004-create-app-sessions dbms:mysql
CREATE TABLE app_session (
  token_hash CHAR(64) NOT NULL,
  user_id INT NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (token_hash),
  INDEX idx_app_session_expires_at (expires_at),
  CONSTRAINT fk_app_session_user
    FOREIGN KEY (user_id) REFERENCES app_user (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--rollback DROP TABLE app_session;

--changeset codex:005-add-reference-data-active dbms:mysql
ALTER TABLE seniorenclub ADD COLUMN active TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE austrittsgrund ADD COLUMN active TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE interessengruppe ADD COLUMN active TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE funktion ADD COLUMN active TINYINT(1) NOT NULL DEFAULT 1;

--rollback ALTER TABLE funktion DROP COLUMN active;
--rollback ALTER TABLE interessengruppe DROP COLUMN active;
--rollback ALTER TABLE austrittsgrund DROP COLUMN active;
--rollback ALTER TABLE seniorenclub DROP COLUMN active;

--changeset codex:006-add-session-password-change-flag dbms:mysql
ALTER TABLE app_session ADD COLUMN password_change_required TINYINT(1) NOT NULL DEFAULT 0 AFTER user_id;

--rollback ALTER TABLE app_session DROP COLUMN password_change_required;
