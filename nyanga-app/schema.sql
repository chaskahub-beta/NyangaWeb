-- Esquema de Nyanga Beauty & Spa (MySQL / MariaDB). Se aplica solo la primera vez.
-- Las fechas y horas se guardan como texto (AAAA-MM-DD, HH:MM e ISO 8601 UTC), igual que en la versión Node.

CREATE TABLE IF NOT EXISTS bookings (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  token VARCHAR(64) NOT NULL,
  created_at VARCHAR(30) NOT NULL,
  lang VARCHAR(2) NOT NULL DEFAULT 'fr',
  mode VARCHAR(4) NOT NULL,
  `date` CHAR(10) NOT NULL,
  `start` CHAR(5) NOT NULL,
  `end` CHAR(5) NOT NULL,
  minutes INT NOT NULL,
  services_json TEXT NOT NULL,
  total_cents INT NOT NULL,
  deposit_cents INT NOT NULL,
  pay_full TINYINT NOT NULL DEFAULT 0,
  client_name VARCHAR(100) NOT NULL,
  client_email VARCHAR(254) NOT NULL,
  client_phone VARCHAR(30) NOT NULL,
  gift_name VARCHAR(100) NULL,
  gift_age INT NULL,
  gift_email VARCHAR(254) NULL,
  gift_message VARCHAR(300) NULL,
  status VARCHAR(20) NOT NULL,
  hold_expires_at VARCHAR(30) NULL,
  checkout_id VARCHAR(80) NULL,
  payment_status VARCHAR(20) NULL,
  paid_at VARCHAR(30) NULL,
  gift_code VARCHAR(20) NULL,
  gift_redeemed_at VARCHAR(30) NULL,
  balance_paid_at VARCHAR(30) NULL,
  needs_attention TINYINT NOT NULL DEFAULT 0,
  admin_note TEXT NULL,
  emails_sent_at VARCHAR(30) NULL,
  updated_at VARCHAR(30) NOT NULL,
  UNIQUE KEY uq_gift_code (gift_code),
  KEY idx_bookings_date (`date`),
  KEY idx_bookings_checkout (checkout_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS blocks (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `date` CHAR(10) NOT NULL,
  `start` CHAR(5) NULL,
  `end` CHAR(5) NULL,
  reason VARCHAR(200) NULL,
  created_at VARCHAR(30) NOT NULL,
  KEY idx_blocks_date (`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS settings (
  setting_key VARCHAR(40) NOT NULL PRIMARY KEY,
  setting_value TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Límites de intentos (reservas por IP, contraseña del panel)
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket VARCHAR(120) NOT NULL PRIMARY KEY,
  hits INT NOT NULL,
  until_ts BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Solo para el modo de pago simulado (sin clave SumUp)
CREATE TABLE IF NOT EXISTS mock_checkouts (
  id VARCHAR(80) NOT NULL PRIMARY KEY,
  status VARCHAR(20) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  reference VARCHAR(80) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
