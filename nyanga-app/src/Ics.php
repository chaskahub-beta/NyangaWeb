<?php
declare(strict_types=1);

/*
  "Ajouter à mon agenda": archivo .ics (iPhone, Outlook, Android) y enlace de Google Agenda.
  Las horas de París se convierten a UTC. El .ics lleva recordatorios la víspera y 2 h antes.
*/
final class Ics
{
    private const TXT = [
        'fr' => [
            'title' => 'Nyanga Beauty & Spa',
            'rest' => 'Reste à régler sur place',
            'paidFull' => 'Déjà réglé en totalité',
            'code' => 'Code carte cadeau',
            'offered' => 'Offert par %s',
            'reminder' => 'Rappel : rendez-vous chez Nyanga Beauty & Spa',
            'contact' => 'Pour modifier ou annuler, contactez directement Nyanga Beauty.',
        ],
        'en' => [
            'title' => 'Nyanga Beauty & Spa',
            'rest' => 'Left to pay on site',
            'paidFull' => 'Already paid in full',
            'code' => 'Gift card code',
            'offered' => 'Gift from %s',
            'reminder' => 'Reminder: appointment at Nyanga Beauty & Spa',
            'contact' => 'To change or cancel, please contact Nyanga Beauty directly.',
        ],
    ];

    /** "2026-11-16" + "09:30" (París) → DateTimeImmutable UTC */
    public static function parisToUtc(string $date, string $time): DateTimeImmutable
    {
        $d = new DateTimeImmutable($date . ' ' . $time, new DateTimeZone('Europe/Paris'));
        return $d->setTimezone(new DateTimeZone('UTC'));
    }

    public static function stamp(DateTimeImmutable $d): string
    {
        return $d->setTimezone(new DateTimeZone('UTC'))->format('Ymd\THis\Z');
    }

    private static function text($s): string
    {
        $s = (string) $s;
        $s = str_replace(['\\', ';', ','], ['\\\\', '\\;', '\\,'], $s);
        return preg_replace("/\r?\n/", '\\n', $s);
    }

    /** Líneas de máx. 75 octetos (RFC 5545) sin cortar caracteres UTF-8. */
    private static function fold(string $line): string
    {
        $out = []; $cur = ''; $bytes = 0;
        foreach (preg_split('//u', $line, -1, PREG_SPLIT_NO_EMPTY) as $ch) {
            $n = strlen($ch);
            $limit = count($out) ? 74 : 75;
            if ($bytes + $n > $limit) { $out[] = $cur; $cur = ''; $bytes = 0; }
            $cur .= $ch; $bytes += $n;
        }
        $out[] = $cur;
        return implode("\r\n ", $out);
    }

    public static function eur(int $cents, string $lang): string
    {
        $decimals = $cents % 100 ? 2 : 0;
        $n = number_format($cents / 100, $decimals, ',', "\u{202F}");
        return $lang === 'en'
            ? '€' . number_format($cents / 100, $decimals, '.', ',')
            : $n . "\u{00A0}€";
    }

    private static function eventData(array $b, string $lang, string $address, string $audience = 'client'): array
    {
        $lang = $lang === 'en' ? 'en' : 'fr';
        $L = self::TXT[$lang];
        $services = json_decode($b['services_json'], true);
        $names = array_map(fn($s) => $s['name'][$lang] ?? $s['name']['fr'] ?? $s['id'], $services);
        $guest = $b['mode'] === 'gift' ? $b['gift_name'] : $b['client_name'];

        $title = $audience === 'company' ? $guest . ' · ' . implode(', ', $names) : $L['title'] . ' · ' . implode(', ', $names);

        $lines = [implode(', ', $names)];
        $rest = (int) $b['total_cents'] - (int) $b['deposit_cents'];
        $lines[] = $rest > 0 ? $L['rest'] . ' : ' . self::eur($rest, $lang) : $L['paidFull'];
        if ($b['mode'] === 'gift' && !empty($b['gift_code'])) {
            $lines[] = $L['code'] . ' : ' . $b['gift_code'];
            $lines[] = sprintf($L['offered'], $b['client_name']);
        }
        if ($audience === 'company') {
            $lines[] = $b['client_name'] . ' · ' . $b['client_email'] . ' · ' . $b['client_phone'];
            $lines[] = 'Réf. ' . $b['id'];
        } else {
            $lines[] = $L['contact'];
        }

        return [
            'uid' => $b['id'] . '@nyanga-beauty',
            'start' => self::parisToUtc($b['date'], $b['start']),
            'end' => self::parisToUtc($b['date'], $b['end']),
            'title' => $title,
            'description' => implode("\n", $lines),
            'location' => $address,
            'reminder' => $L['reminder'],
        ];
    }

    public static function build(array $b, string $lang, string $address, string $audience = 'client', bool $cancel = false): string
    {
        $e = self::eventData($b, $lang, $address, $audience);
        $lines = [
            'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Nyanga Beauty & Spa//Reservations//FR', 'CALSCALE:GREGORIAN',
            'METHOD:' . ($cancel ? 'CANCEL' : 'PUBLISH'),
            'BEGIN:VEVENT',
            'UID:' . $e['uid'],
            'DTSTAMP:' . self::stamp(Clock::now()),
            'SEQUENCE:' . ($cancel ? 1 : 0),
            'DTSTART:' . self::stamp($e['start']),
            'DTEND:' . self::stamp($e['end']),
            'SUMMARY:' . self::text($e['title']),
            'DESCRIPTION:' . self::text($e['description']),
            'LOCATION:' . self::text($e['location']),
            'STATUS:' . ($cancel ? 'CANCELLED' : 'CONFIRMED'),
            'TRANSP:OPAQUE',
        ];
        if (!$cancel) {
            foreach (['-P1D', '-PT2H'] as $trigger) {
                array_push($lines, 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' . self::text($e['reminder']), 'TRIGGER:' . $trigger, 'END:VALARM');
            }
        }
        array_push($lines, 'END:VEVENT', 'END:VCALENDAR');
        return implode("\r\n", array_map([self::class, 'fold'], $lines)) . "\r\n";
    }

    public static function googleUrl(array $b, string $lang, string $address): string
    {
        $e = self::eventData($b, $lang, $address);
        return 'https://calendar.google.com/calendar/render?' . http_build_query([
            'action' => 'TEMPLATE',
            'text' => $e['title'],
            'dates' => self::stamp($e['start']) . '/' . self::stamp($e['end']),
            'details' => $e['description'],
            'location' => $e['location'],
            'ctz' => 'Europe/Paris',
        ], '', '&', PHP_QUERY_RFC1738);
    }

    public static function links(array $b, string $publicUrl, string $address, string $lang): array
    {
        return [
            'ics' => $publicUrl . '/api/bookings/' . rawurlencode($b['id']) . '/calendar.ics?t=' . rawurlencode($b['token']),
            'google' => self::googleUrl($b, $lang, $address),
        ];
    }
}
