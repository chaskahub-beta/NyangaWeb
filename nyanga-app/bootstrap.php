<?php
/*
  Arranque de la aplicación: carga la configuración y las clases.
  Lo incluye public_html/api/index.php.
*/

declare(strict_types=1);

define('NYANGA_APP', __DIR__);

spl_autoload_register(function (string $class): void {
    $file = __DIR__ . '/src/' . $class . '.php';
    if (is_file($file)) require $file;
});

final class Config
{
    /** @return array<string,mixed> */
    public static function load(): array
    {
        // En el hosting: nyanga-app/config.php. En Docker local se indica con NYANGA_CONFIG.
        $file = getenv('NYANGA_CONFIG') ?: NYANGA_APP . '/config.php';
        if (!is_file($file)) {
            throw new AppError('config_missing', 503);
        }
        $c = require $file;
        if (!is_array($c)) throw new AppError('config_missing', 503);
        $defaults = require NYANGA_APP . '/config.example.php';
        $c = array_replace_recursive($defaults, $c);

        $c['public_url'] = rtrim((string) $c['public_url'], '/');
        $c['timezone'] = 'Europe/Paris';
        $c['outbox_dir'] = NYANGA_APP . '/storage/outbox';
        $c['payments_mode'] = ($c['sumup']['api_key'] !== '' && $c['sumup']['merchant_code'] !== '') ? 'sumup' : 'mock';
        $c['mail_mode'] = $c['mail']['host'] !== '' ? 'smtp' : 'outbox';
        $c['secure_cookies'] = str_starts_with($c['public_url'], 'https://');
        $c['test_clock'] = !empty($c['test_clock']);
        if (strlen((string) $c['session_secret']) < 16) {
            // Sin secreto propio se deriva uno de la contraseña de la base (estable entre peticiones)
            $c['session_secret'] = hash('sha256', 'nyanga|' . $c['db']['pass'] . '|' . $c['db']['name'] . '|' . __DIR__);
        }
        return $c;
    }
}

/** Hora actual. En pruebas locales (test_clock) se puede fijar con la cabecera X-Test-Now. */
final class Clock
{
    private static ?DateTimeImmutable $fixed = null;

    public static function init(array $config): void
    {
        $h = $_SERVER['HTTP_X_TEST_NOW'] ?? '';
        if ($config['test_clock'] && $h !== '') {
            self::$fixed = new DateTimeImmutable($h);
        }
    }

    public static function now(): DateTimeImmutable
    {
        return (self::$fixed ?? new DateTimeImmutable('now'))->setTimezone(new DateTimeZone('UTC'));
    }

    /** ISO 8601 en UTC con milisegundos, como el servidor Node: 2026-11-14T10:00:00.000Z */
    public static function iso(?DateTimeImmutable $d = null): string
    {
        return ($d ?? self::now())->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\TH:i:s.v\Z');
    }

    public static function isoPlusMinutes(int $minutes): string
    {
        return self::iso(self::now()->modify('+' . $minutes . ' minutes'));
    }
}
