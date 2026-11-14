<?php
declare(strict_types=1);

/*
  Agenda: festivos franceses, hora de París y cálculo de horarios libres.
  Fechas "AAAA-MM-DD" y horas "HH:MM" en hora de París.
*/
final class Calendar
{
    /** @var array<int,array<string,string>> */
    private static array $holidayCache = [];

    public static function isDate($s): bool
    {
        if (!is_string($s) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $s)) return false;
        [$y, $m, $d] = array_map('intval', explode('-', $s));
        return checkdate($m, $d, $y);
    }

    public static function isTime($s): bool
    {
        return is_string($s) && (bool) preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $s);
    }

    public static function toMin(string $t): int
    {
        [$h, $m] = array_map('intval', explode(':', $t));
        return $h * 60 + $m;
    }

    public static function toTime(int $min): string
    {
        return sprintf('%02d:%02d', intdiv($min, 60), $min % 60);
    }

    public static function dateKey(int $y, int $m, int $d): string
    {
        return sprintf('%04d-%02d-%02d', $y, $m, $d);
    }

    public static function addDays(string $key, int $n): string
    {
        [$y, $m, $d] = array_map('intval', explode('-', $key));
        $ts = gmmktime(0, 0, 0, $m, $d + $n, $y);
        return gmdate('Y-m-d', $ts);
    }

    /** 0 = domingo … 6 = sábado */
    public static function weekday(string $key): int
    {
        [$y, $m, $d] = array_map('intval', explode('-', $key));
        return (int) gmdate('w', gmmktime(0, 0, 0, $m, $d, $y));
    }

    /** Fecha y minutos actuales en París. */
    public static function parisNow(DateTimeImmutable $now, string $tz = 'Europe/Paris'): array
    {
        $p = $now->setTimezone(new DateTimeZone($tz));
        return ['date' => $p->format('Y-m-d'), 'minutes' => (int) $p->format('G') * 60 + (int) $p->format('i')];
    }

    /** Domingo de Pascua (Meeus/Jones/Butcher) */
    public static function easter(int $y): string
    {
        $a = $y % 19; $b = intdiv($y, 100); $c = $y % 100; $d = intdiv($b, 4); $e = $b % 4;
        $f = intdiv($b + 8, 25); $g = intdiv($b - $f + 1, 3);
        $h = (19 * $a + $b - $d - $g + 15) % 30; $i = intdiv($c, 4); $k = $c % 4;
        $l = (32 + 2 * $e + 2 * $i - $h - $k) % 7; $m = intdiv($a + 11 * $h + 22 * $l, 451);
        $month = intdiv($h + $l - 7 * $m + 114, 31);
        $day = (($h + $l - 7 * $m + 114) % 31) + 1;
        return self::dateKey($y, $month, $day);
    }

    /** Jours fériés en France métropolitaine. */
    public static function frenchHolidays(int $y): array
    {
        if (isset(self::$holidayCache[$y])) return self::$holidayCache[$y];
        $e = self::easter($y);
        $map = [
            self::dateKey($y, 1, 1) => "Jour de l'an",
            self::addDays($e, 1) => 'Lundi de Pâques',
            self::dateKey($y, 5, 1) => 'Fête du Travail',
            self::dateKey($y, 5, 8) => 'Victoire 1945',
            self::addDays($e, 39) => 'Ascension',
            self::addDays($e, 50) => 'Lundi de Pentecôte',
            self::dateKey($y, 7, 14) => 'Fête nationale',
            self::dateKey($y, 8, 15) => 'Assomption',
            self::dateKey($y, 11, 1) => 'Toussaint',
            self::dateKey($y, 11, 11) => 'Armistice',
            self::dateKey($y, 12, 25) => 'Noël',
        ];
        return self::$holidayCache[$y] = $map;
    }

    public static function holidayName(string $key): ?string
    {
        return self::frenchHolidays((int) substr($key, 0, 4))[$key] ?? null;
    }

    /**
     * Estado de un día y sus horarios libres para una duración dada.
     * ctx: settings, blocks [{start,end}], busy [{start,end}], today, windowDays
     */
    public static function dayAvailability(string $key, int $minutes, array $ctx): array
    {
        $result = ['date' => $key, 'status' => 'open', 'slots' => []];
        $first = self::addDays($ctx['today'], 1);
        $last = self::addDays($ctx['today'], (int) $ctx['windowDays']);
        if ($key < $first || $key > $last) { $result['status'] = 'out'; return $result; }

        $holiday = self::holidayName($key);
        if ($holiday) { $result['status'] = 'holiday'; $result['holiday'] = $holiday; return $result; }

        $hours = $ctx['settings']['openingHours'][(string) self::weekday($key)] ?? [];
        if (count($hours) === 0) { $result['status'] = 'closed'; return $result; }

        $blocks = $ctx['blocks'] ?? [];
        foreach ($blocks as $b) {
            if (empty($b['start']) || empty($b['end'])) { $result['status'] = 'blocked'; return $result; }
        }

        $step = (int) $ctx['settings']['slotStep'];
        $buffer = (int) $ctx['settings']['bufferMinutes'];
        $busy = array_map(fn($b) => [self::toMin($b['start']), self::toMin($b['end'])], $ctx['busy'] ?? []);
        $blk = array_map(fn($b) => [self::toMin($b['start']), self::toMin($b['end'])], $blocks);

        foreach ($hours as [$open, $close]) {
            $o = self::toMin($open); $c = self::toMin($close);
            for ($s = $o; $s + $minutes <= $c; $s += $step) {
                $e = $s + $minutes;
                $clash = false;
                foreach ($busy as [$bs, $be]) { if ($s < $be + $buffer && $e + $buffer > $bs) { $clash = true; break; } }
                if (!$clash) foreach ($blk as [$bs, $be]) { if ($s < $be && $e > $bs) { $clash = true; break; } }
                if (!$clash) $result['slots'][] = self::toTime($s);
            }
        }
        if (count($result['slots']) === 0) $result['status'] = 'full';
        return $result;
    }
}
