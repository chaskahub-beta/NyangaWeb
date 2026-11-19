<?php
declare(strict_types=1);

/*
  Base de datos MySQL / MariaDB (PDO).
  Las tablas se crean solas la primera vez (ver schema.sql).
*/
final class Db
{
    public const DEFAULT_SETTINGS = [
        // 0 = dimanche … 6 = samedi. Horaires communiqués par la gérante (modifiables dans le panel).
        'openingHours' => [
            '0' => [],
            '1' => [],
            '2' => [['09:30', '12:00'], ['13:30', '16:00'], ['16:30', '19:30']],
            '3' => [['09:00', '12:00'], ['13:30', '19:00']],
            '4' => [['09:30', '12:00'], ['13:30', '16:00'], ['16:30', '19:30']],
            '5' => [['09:00', '12:00'], ['13:30', '19:00']],
            '6' => [['09:00', '12:00'], ['13:30', '19:00']],
        ],
        'slotStep' => 30,
        'bufferMinutes' => 15,
    ];

    public PDO $pdo;

    public function __construct(array $c)
    {
        $dsn = sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', $c['host'], $c['name']);
        try {
            $this->pdo = new PDO($dsn, $c['user'], $c['pass'], [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]);
        } catch (PDOException $e) {
            error_log('[db] connexion impossible: ' . $e->getMessage());
            throw new AppError('db_unavailable', 503);
        }
        $this->pdo->exec("SET time_zone = '+00:00'");
        $this->migrate();
    }

    /** Crea las tablas si faltan (la primera visita tras instalar). */
    private function migrate(): void
    {
        try {
            // Lo último que se añadió al esquema: si existe, está todo al día
            $this->pdo->query('SELECT refunded_cents, gift_expires_at FROM bookings LIMIT 0');
            $this->pdo->query('SELECT price_from FROM services LIMIT 0');
            $this->pdo->query('SELECT 1 FROM mock_checkouts LIMIT 0');
            return;
        } catch (PDOException $e) {
            // falta algo → se crea o se actualiza el esquema
        }
        $sql = (string) file_get_contents(NYANGA_APP . '/schema.sql');
        $sql = preg_replace('/^\s*--.*$/m', '', $sql);
        foreach (array_filter(array_map('trim', explode(';', $sql))) as $stmt) {
            $this->pdo->exec($stmt);
        }
        // Instalaciones anteriores: columna "pagar el total por adelantado"
        $col = $this->one("SHOW COLUMNS FROM bookings LIKE 'pay_full'");
        if (!$col) $this->pdo->exec('ALTER TABLE bookings ADD COLUMN pay_full TINYINT NOT NULL DEFAULT 0 AFTER deposit_cents');

        // Instalaciones anteriores: carte cadeau sin fecha (1 año), reembolsos, precios «à partir de»
        $alters = [
            ['bookings', 'gift_expires_at', "ALTER TABLE bookings MODIFY `date` CHAR(10) NULL, MODIFY `start` CHAR(5) NULL, MODIFY `end` CHAR(5) NULL,
                ADD COLUMN gift_expires_at CHAR(10) NULL, ADD COLUMN gift_scheduled_at VARCHAR(30) NULL"],
            ['bookings', 'refunded_cents', 'ALTER TABLE bookings ADD COLUMN refunded_cents INT NULL, ADD COLUMN refunded_at VARCHAR(30) NULL'],
            ['services', 'price_from', 'ALTER TABLE services ADD COLUMN price_from TINYINT NOT NULL DEFAULT 0 AFTER price_cents, MODIFY desc_fr TEXT NULL, MODIFY desc_en TEXT NULL'],
        ];
        foreach ($alters as [$table, $column, $sql]) {
            if (!$this->one("SHOW COLUMNS FROM `$table` LIKE '$column'")) $this->pdo->exec($sql);
        }

        // Primera vez: los soins de la carta (catalog.json) pasan a la base, donde se editan desde el panel
        $count = $this->one('SELECT COUNT(*) AS n FROM services');
        if ($count && (int) $count['n'] === 0) {
            $data = json_decode((string) file_get_contents(NYANGA_APP . '/catalog.json'), true);
            $i = 0;
            foreach ($data['services'] as $s) {
                $this->run('INSERT INTO services (id, cat, sort_order, price_cents, price_from, duration, slot_minutes, name_fr, name_en, sub_fr, sub_en, desc_fr, desc_en, active, updated_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [
                    $s['id'], $s['cat'], ($i++) * 10, (int) round($s['price'] * 100), empty($s['priceFrom']) ? 0 : 1, $s['duration'], (int) $s['slotMinutes'],
                    $s['name']['fr'], $s['name']['en'] ?? null, $s['sub']['fr'] ?? null, $s['sub']['en'] ?? null,
                    $s['desc']['fr'] ?? null, $s['desc']['en'] ?? null, isset($s['active']) && !$s['active'] ? 0 : 1, Clock::iso(),
                ]);
            }
        }
    }

    public function all(string $sql, array $args = []): array
    {
        $st = $this->pdo->prepare($sql);
        $st->execute($args);
        return $st->fetchAll();
    }

    public function one(string $sql, array $args = []): ?array
    {
        $st = $this->pdo->prepare($sql);
        $st->execute($args);
        $r = $st->fetch();
        return $r === false ? null : $r;
    }

    public function run(string $sql, array $args = []): int
    {
        $st = $this->pdo->prepare($sql);
        $st->execute($args);
        return $st->rowCount();
    }

    /**
     * Ejecuta fn con un bloqueo exclusivo de la agenda: dos clientas no pueden
     * reservar el mismo horario a la vez.
     */
    public function locked(callable $fn)
    {
        $got = $this->one("SELECT GET_LOCK('nyanga_agenda', 10) AS l");
        if (!$got || (int) $got['l'] !== 1) throw new AppError('busy', 503);
        $this->pdo->beginTransaction();
        try {
            $r = $fn();
            $this->pdo->commit();
            return $r;
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $e;
        } finally {
            $this->one("SELECT RELEASE_LOCK('nyanga_agenda') AS l");
        }
    }

    public function getSettings(): array
    {
        $row = $this->one("SELECT setting_value FROM settings WHERE setting_key = 'main'");
        $s = self::DEFAULT_SETTINGS;
        if ($row) {
            $saved = json_decode($row['setting_value'], true) ?: [];
            $s = array_replace($s, $saved);
        }
        // Claves de día siempre como texto "0".."6"
        $hours = [];
        for ($d = 0; $d <= 6; $d++) $hours[(string) $d] = array_values($s['openingHours'][$d] ?? $s['openingHours'][(string) $d] ?? []);
        $s['openingHours'] = $hours;
        return $s;
    }

    public function saveSettings(array $s): void
    {
        $json = json_encode(['openingHours' => (object) $s['openingHours'], 'slotStep' => $s['slotStep'], 'bufferMinutes' => $s['bufferMinutes']]);
        $this->run("INSERT INTO settings (setting_key, setting_value) VALUES ('main', ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)", [$json]);
    }
}
