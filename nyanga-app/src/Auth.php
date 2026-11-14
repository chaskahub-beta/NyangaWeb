<?php
declare(strict_types=1);

/*
  Sesión del panel: contraseña única (admin_password) y cookie firmada con HMAC
  que caduca a las 12 horas. 5 intentos fallidos por IP → espera de 15 min.
*/
final class Auth
{
    private const COOKIE = 'nyanga_admin';
    private const TTL = 12 * 3600;

    private array $config;
    private Db $db;

    public function __construct(array $config, Db $db)
    {
        $this->config = $config;
        $this->db = $db;
    }

    private function sign(string $payload): string
    {
        return rtrim(strtr(base64_encode(hash_hmac('sha256', $payload, (string) $this->config['session_secret'], true)), '+/', '-_'), '=');
    }

    private function setCookie(string $value, int $maxAge): void
    {
        setcookie(self::COOKIE, $value, [
            'expires' => $maxAge > 0 ? time() + $maxAge : time() - 3600,
            'path' => '/',
            'secure' => (bool) $this->config['secure_cookies'],
            'httponly' => true,
            'samesite' => 'Strict',
        ]);
    }

    public function issue(): void
    {
        $exp = (Clock::now()->getTimestamp() + self::TTL) * 1000;
        $payload = 'admin.' . $exp;
        $this->setCookie($payload . '.' . $this->sign($payload), self::TTL);
    }

    public function clear(): void { $this->setCookie('', 0); }

    public function isValid(): bool
    {
        $v = $_COOKIE[self::COOKIE] ?? '';
        $parts = explode('.', (string) $v);
        if (count($parts) !== 3) return false;
        $payload = $parts[0] . '.' . $parts[1];
        if (!hash_equals($this->sign($payload), $parts[2])) return false;
        return (int) $parts[1] > Clock::now()->getTimestamp() * 1000;
    }

    public function guard(): void
    {
        if (!$this->isValid()) throw new AppError('unauthorized', 401);
    }

    public function login(string $password, string $ip): void
    {
        $expected = (string) $this->config['admin_password'];
        if ($expected === '') throw new AppError('admin_disabled', 503);
        $bucket = 'login:' . $ip;
        if (RateLimit::blocked($this->db, $bucket, 5)) throw new AppError('too_many_attempts', 429);
        if (hash_equals($expected, $password)) {
            RateLimit::reset($this->db, $bucket);
            $this->issue();
            return;
        }
        RateLimit::hit($this->db, $bucket, 15 * 60);
        throw new AppError('wrong_password', 401);
    }
}
