<?php
declare(strict_types=1);

/** Límites por IP guardados en la base (PHP no tiene memoria entre peticiones). */
final class RateLimit
{
    private static function nowTs(): int { return Clock::now()->getTimestamp(); }

    public static function blocked(Db $db, string $bucket, int $max): bool
    {
        $r = $db->one('SELECT hits, until_ts FROM rate_limits WHERE bucket = ?', [$bucket]);
        return $r && (int) $r['until_ts'] > self::nowTs() && (int) $r['hits'] >= $max;
    }

    /** Cuenta un intento; la ventana empieza con el primero. */
    public static function hit(Db $db, string $bucket, int $windowSec): int
    {
        $now = self::nowTs();
        $r = $db->one('SELECT hits, until_ts FROM rate_limits WHERE bucket = ?', [$bucket]);
        if (!$r || (int) $r['until_ts'] <= $now) {
            $db->run('REPLACE INTO rate_limits (bucket, hits, until_ts) VALUES (?,?,?)', [$bucket, 1, $now + $windowSec]);
            if (random_int(1, 50) === 1) $db->run('DELETE FROM rate_limits WHERE until_ts < ?', [$now]);
            return 1;
        }
        $db->run('UPDATE rate_limits SET hits = hits + 1 WHERE bucket = ?', [$bucket]);
        return (int) $r['hits'] + 1;
    }

    /** Lanza too_many_requests si se supera max en la ventana. */
    public static function enforce(Db $db, string $bucket, int $max, int $windowSec): void
    {
        if (self::hit($db, $bucket, $windowSec) > $max) throw new AppError('too_many_requests', 429);
    }

    public static function reset(Db $db, string $bucket): void
    {
        $db->run('DELETE FROM rate_limits WHERE bucket = ?', [$bucket]);
    }
}
