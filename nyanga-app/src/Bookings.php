<?php
declare(strict_types=1);

/*
  Reservas, pagos, cartas regalo y acciones del panel.
  Misma lógica que la versión Node (server/bookings.js).
*/
final class Bookings
{
    private const OCCUPYING = ['confirmed', 'completed', 'no_show'];
    private const EMAIL_RE = '/^[^\s@<>"\']+@[^\s@<>"\']+\.[^\s@<>"\']{2,}$/';
    private const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    private array $config;
    private Db $db;
    private SumUp $payments;
    private Mailer $mailer;

    public function __construct(array $config, Db $db, SumUp $payments, Mailer $mailer)
    {
        $this->config = $config;
        $this->db = $db;
        $this->payments = $payments;
        $this->mailer = $mailer;
    }

    /* ---------------- Utilidades ---------------- */

    private static function cleanText($v, int $max): string
    {
        if (!is_string($v)) return '';
        $v = preg_replace('/[\x00-\x1f\x7f]/u', ' ', $v) ?? '';
        return mb_substr(trim($v), 0, $max, 'UTF-8');
    }

    private static function randomId(int $bytes): string
    {
        return rtrim(strtr(base64_encode(random_bytes($bytes)), '+/', '-_'), '=');
    }

    public static function randomGiftCode(): string
    {
        $s = '';
        for ($i = 0; $i < 8; $i++) $s .= self::CODE_ALPHABET[random_int(0, strlen(self::CODE_ALPHABET) - 1)];
        return 'NYG-' . substr($s, 0, 4) . '-' . substr($s, 4);
    }

    public static function normalizeCode($code): string
    {
        $c = preg_replace('/[^A-Z0-9]/', '', strtoupper((string) $code)) ?? '';
        return preg_replace('/^NYG/', '', $c) ?? '';
    }

    private function today(): string { return Calendar::parisNow(Clock::now(), $this->config['timezone'])['date']; }

    private function find(string $id): array
    {
        $b = $this->db->one('SELECT * FROM bookings WHERE id = ?', [$id]);
        if (!$b) throw new AppError('not_found', 404);
        return $b;
    }

    public function findWithToken($id, $token): array
    {
        $b = $this->db->one('SELECT * FROM bookings WHERE id = ?', [(string) ($id ?? '')]);
        if (!$b || !is_string($token) || !hash_equals($b['token'], $token)) throw new AppError('not_found', 404);
        return $b;
    }

    private function update(string $id, array $fields): void
    {
        $sets = []; $args = [];
        foreach ($fields as $k => $v) { $sets[] = "`$k` = ?"; $args[] = $v; }
        $sets[] = 'updated_at = ?'; $args[] = Clock::iso();
        $args[] = $id;
        $this->db->run('UPDATE bookings SET ' . implode(', ', $sets) . ' WHERE id = ?', $args);
    }

    public function expireHolds(): void
    {
        $n = Clock::iso();
        $this->db->run("UPDATE bookings SET status = 'expired', updated_at = ? WHERE status = 'pending_payment' AND hold_expires_at <= ?", [$n, $n]);
    }

    /* ---------------- Disponibilidad ---------------- */

    private function dayContext(string $date, ?string $excludeId): array
    {
        $busy = $this->db->all("SELECT id, `start`, `end` FROM bookings WHERE `date` = ? AND (status IN ('confirmed','completed','no_show')
            OR (status = 'pending_payment' AND hold_expires_at > ?))", [$date, Clock::iso()]);
        if ($excludeId !== null) $busy = array_values(array_filter($busy, fn($b) => $b['id'] !== $excludeId));
        return [
            'settings' => $this->db->getSettings(),
            'blocks' => $this->db->all('SELECT id, `date`, `start`, `end`, reason FROM blocks WHERE `date` = ?', [$date]),
            'busy' => $busy,
            'today' => $this->today(),
            'windowDays' => (int) $this->config['booking_window_days'],
        ];
    }

    public function day($date, $minutes, ?string $excludeId = null): array
    {
        if (!Calendar::isDate($date)) throw new AppError('invalid_date');
        if (!is_int($minutes) || $minutes < 15 || $minutes > 600) throw new AppError('invalid_duration');
        return Calendar::dayAvailability($date, $minutes, $this->dayContext($date, $excludeId));
    }

    public function month($ym, $minutes): array
    {
        if (!is_string($ym) || !preg_match('/^\d{4}-\d{2}$/', $ym)) throw new AppError('invalid_month');
        [$y, $m] = array_map('intval', explode('-', $ym));
        if ($m < 1 || $m > 12) throw new AppError('invalid_month');
        if (!is_int($minutes) || $minutes < 15 || $minutes > 600) throw new AppError('invalid_duration');

        // Una sola lectura de la base para todo el mes
        $n = (int) gmdate('t', gmmktime(0, 0, 0, $m, 1, $y));
        $first = $ym . '-01'; $last = sprintf('%s-%02d', $ym, $n);
        $settings = $this->db->getSettings();
        $busyAll = $this->db->all("SELECT id, `date`, `start`, `end` FROM bookings WHERE `date` BETWEEN ? AND ? AND (status IN ('confirmed','completed','no_show')
            OR (status = 'pending_payment' AND hold_expires_at > ?))", [$first, $last, Clock::iso()]);
        $blocksAll = $this->db->all('SELECT id, `date`, `start`, `end`, reason FROM blocks WHERE `date` BETWEEN ? AND ?', [$first, $last]);
        $today = $this->today();

        $days = [];
        for ($d = 1; $d <= $n; $d++) {
            $key = sprintf('%s-%02d', $ym, $d);
            $r = Calendar::dayAvailability($key, $minutes, [
                'settings' => $settings,
                'blocks' => array_values(array_filter($blocksAll, fn($b) => $b['date'] === $key)),
                'busy' => array_values(array_filter($busyAll, fn($b) => $b['date'] === $key)),
                'today' => $today,
                'windowDays' => (int) $this->config['booking_window_days'],
            ]);
            $row = ['date' => $key, 'status' => $r['status'], 'free' => count($r['slots'])];
            if (!empty($r['holiday'])) $row['holiday'] = $r['holiday'];
            $days[] = $row;
        }
        return [
            'month' => $ym,
            'first' => Calendar::addDays($today, 1),
            'last' => Calendar::addDays($today, (int) $this->config['booking_window_days']),
            'days' => $days,
        ];
    }

    /* ---------------- Validación ---------------- */

    private function validate(array $input): array
    {
        $lang = ($input['lang'] ?? '') === 'en' ? 'en' : 'fr';
        $mode = $input['mode'] ?? null;
        if ($mode !== 'me' && $mode !== 'gift') throw new AppError('invalid_mode');
        $sel = Catalog::priceSelection($input['services'] ?? null);
        // La carte cadeau se compra sin fecha: el beneficiario elige su día después (válida 1 año)
        if ($mode === 'me') {
            if (!Calendar::isDate($input['date'] ?? null)) throw new AppError('invalid_date');
            if (!Calendar::isTime($input['start'] ?? null)) throw new AppError('invalid_time');
        }

        $c = is_array($input['client'] ?? null) ? $input['client'] : [];
        $client = [
            'name' => self::cleanText($c['name'] ?? null, 100),
            'email' => mb_strtolower(self::cleanText($c['email'] ?? null, 254)),
            'phone' => self::cleanText($c['phone'] ?? null, 30),
        ];
        $fields = [];
        if (mb_strlen($client['name']) < 2) $fields[] = 'client.name';
        if (!preg_match(self::EMAIL_RE, $client['email'])) $fields[] = 'client.email';
        $digits = preg_replace('/\D/', '', $client['phone']);
        if (strlen($digits) < 9 || strlen($digits) > 15 || preg_match('/[^\d\s+().-]/', $client['phone'])) $fields[] = 'client.phone';

        $gift = null;
        if ($mode === 'gift') {
            $g = is_array($input['gift'] ?? null) ? $input['gift'] : [];
            $age = $g['age'] ?? null;
            $ageNum = is_numeric($age) ? $age + 0 : null;
            $gift = [
                'name' => self::cleanText($g['name'] ?? null, 100),
                'age' => is_int($ageNum) ? $ageNum : null,
                'email' => mb_strtolower(self::cleanText($g['email'] ?? null, 254)),
                'message' => self::cleanText($g['message'] ?? null, 300),
            ];
            if (mb_strlen($gift['name']) < 2) $fields[] = 'gift.name';
            if ($gift['age'] === null || $gift['age'] < 1 || $gift['age'] > 120) $fields[] = 'gift.age';
            if (!preg_match(self::EMAIL_RE, $gift['email'])) $fields[] = 'gift.email';
        }
        if (($input['acceptDeposit'] ?? null) !== true) $fields[] = 'acceptDeposit';
        if ($fields) throw new AppError('invalid_fields', 400, ['fields' => $fields]);

        // Pour moi: acompte del 20 % o, como segunda opción, el total. Carte cadeau: siempre el total.
        $payFull = $mode === 'gift' || ($input['payFull'] ?? false) === true;

        return [
            'lang' => $lang, 'mode' => $mode, 'sel' => $sel,
            'date' => $mode === 'me' ? $input['date'] : null, 'start' => $mode === 'me' ? $input['start'] : null,
            'client' => $client, 'gift' => $gift, 'payFull' => $payFull,
        ];
    }

    /* ---------------- Reserva ---------------- */

    private function startPayment(array $b, string $attempt): string
    {
        try {
            $what = $b['mode'] === 'gift' ? 'Carte cadeau' : ((int) $b['pay_full'] ? 'Paiement total' : 'Acompte 20 %');
            $when = $b['date'] ? ' · ' . $b['date'] . ' ' . $b['start'] : '';
            $c = $this->payments->createCheckout($b, $b['id'] . '-' . $attempt, $what . ' Nyanga Beauty' . $when);
            $this->update($b['id'], ['checkout_id' => $c['id'], 'payment_status' => 'PENDING']);
            return $c['url'];
        } catch (Throwable $e) {
            error_log('[sumup] création du paiement échouée: ' . $e->getMessage());
            $this->update($b['id'], ['status' => 'payment_failed', 'hold_expires_at' => null]);
            throw new AppError('payment_unavailable', 502);
        }
    }

    public function create($input): array
    {
        $v = $this->validate(is_array($input) ? $input : []);
        $this->expireHolds();

        $id = self::randomId(9);
        $token = self::randomId(18);
        $total = $v['sel']['totalCents'];
        // deposit_cents = lo que se paga en línea: el 20 % o el total
        $deposit = $v['payFull'] ? $total : (int) round($total * (float) $this->config['deposit_rate']);
        $end = $v['start'] ? Calendar::toTime(Calendar::toMin($v['start']) + $v['sel']['minutes']) : null;
        $hold = Clock::isoPlusMinutes((int) $this->config['hold_minutes']);
        $services = array_map(fn($s) => ['id' => $s['id'], 'name' => $s['name'], 'priceCents' => (int) round($s['price'] * 100), 'minutes' => $s['slotMinutes']], $v['sel']['items']);

        $payFull = $v['payFull'] ? 1 : 0;
        $this->db->locked(function () use ($v, $id, $token, $total, $deposit, $payFull, $end, $hold, $services) {
            if ($v['mode'] === 'me') {
                $avail = $this->day($v['date'], $v['sel']['minutes']);
                if (!in_array($v['start'], $avail['slots'], true)) throw new AppError('slot_unavailable', 409);
            }
            $n = Clock::iso();
            $g = $v['gift'];
            $this->db->run('INSERT INTO bookings (id, token, created_at, lang, mode, `date`, `start`, `end`, minutes, services_json,
                total_cents, deposit_cents, pay_full, client_name, client_email, client_phone, gift_name, gift_age, gift_email,
                gift_message, status, hold_expires_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [
                $id, $token, $n, $v['lang'], $v['mode'], $v['date'], $v['start'], $end, $v['sel']['minutes'],
                json_encode($services, JSON_UNESCAPED_UNICODE), $total, $deposit, $payFull,
                $v['client']['name'], $v['client']['email'], $v['client']['phone'],
                $g ? $g['name'] : null, $g ? $g['age'] : null, $g ? $g['email'] : null, $g ? ($g['message'] ?: null) : null,
                'pending_payment', $hold, $n,
            ]);
        });

        $url = $this->startPayment($this->find($id), '1');
        return ['id' => $id, 'token' => $token, 'paymentUrl' => $url];
    }

    /** Reintenta el pago si el horario sigue libre. */
    public function retryPayment($id, $token): array
    {
        $b = $this->findWithToken($id, $token);
        if (!in_array($b['status'], ['pending_payment', 'payment_failed', 'expired'], true)) throw new AppError('not_payable', 409);

        // Si el pago anterior ya entró, no se cobra dos veces
        $this->sync($b);
        $fresh = $this->find($b['id']);
        if ($fresh['status'] === 'confirmed') return ['paymentUrl' => null, 'status' => 'confirmed'];

        $hold = Clock::isoPlusMinutes((int) $this->config['hold_minutes']);
        $this->db->locked(function () use ($fresh, $hold) {
            $this->expireHolds();
            if ($fresh['date']) {
                $avail = $this->day($fresh['date'], (int) $fresh['minutes'], $fresh['id']);
                if (!in_array($fresh['start'], $avail['slots'], true)) throw new AppError('slot_unavailable', 409);
            }
            $this->update($fresh['id'], ['status' => 'pending_payment', 'hold_expires_at' => $hold]);
        });
        $url = $this->startPayment($this->find($b['id']), 'r' . self::randomId(4));
        return ['paymentUrl' => $url, 'status' => 'pending_payment'];
    }

    /** Consulta el estado real del pago y actualiza la reserva. */
    public function sync(array $b): array
    {
        if (empty($b['checkout_id']) || !in_array($b['status'], ['pending_payment', 'expired', 'payment_failed'], true)) return $b;
        try { $c = $this->payments->getCheckout($b['checkout_id']); }
        catch (Throwable $e) { error_log('[sumup] lecture du paiement échouée: ' . $e->getMessage()); return $b; }

        if ($c['status'] === 'PAID') {
            $expected = $b['deposit_cents'] / 100;
            if (abs((float) ($c['amount'] ?? 0) - $expected) > 0.001 || (!empty($c['currency']) && $c['currency'] !== 'EUR')) {
                $this->update($b['id'], ['payment_status' => 'AMOUNT_MISMATCH', 'needs_attention' => 1]);
                error_log('[sumup] montant inattendu pour ' . $b['id']);
                return $this->find($b['id']);
            }
            $this->confirm($b['id']);
        } elseif ($c['status'] === 'FAILED' && $b['status'] === 'pending_payment') {
            $this->update($b['id'], ['status' => 'payment_failed', 'payment_status' => 'FAILED', 'hold_expires_at' => null]);
        } elseif ($c['status'] === 'EXPIRED' && $b['status'] === 'pending_payment') {
            $this->update($b['id'], ['status' => 'expired', 'payment_status' => 'EXPIRED', 'hold_expires_at' => null]);
        }
        return $this->find($b['id']);
    }

    private function confirm(string $id): void
    {
        $confirmedNow = $this->db->locked(function () use ($id) {
            $b = $this->find($id);
            if (in_array($b['status'], self::OCCUPYING, true) || in_array($b['status'], ['cancelled', 'refunded'], true)) return false;

            // Si la retención ya había caducado, el horario pudo ocuparse
            $conflict = false;
            if ($b['date']) {
                $avail = $this->day($b['date'], (int) $b['minutes'], $b['id']);
                $conflict = !in_array($b['start'], $avail['slots'], true);
            }

            $fields = [
                'status' => 'confirmed',
                'payment_status' => 'PAID',
                'paid_at' => Clock::iso(),
                'hold_expires_at' => null,
                'needs_attention' => $conflict ? 1 : (int) $b['needs_attention'],
            ];
            if ($b['mode'] === 'gift') {
                do { $code = self::randomGiftCode(); } while ($this->db->one('SELECT id FROM bookings WHERE gift_code = ?', [$code]));
                $fields['gift_code'] = $code;
                // Válida 1 año desde la compra
                $fields['gift_expires_at'] = Calendar::addDays($this->today(), 365);
            }
            $this->update($id, $fields);
            return true;
        });
        if ($confirmedNow) $this->sendConfirmation($id);
    }

    private function sendConfirmation(string $id): bool
    {
        $b = $this->find($id);
        try {
            $this->mailer->sendAll($this->mailer->confirmationEmails($b));
            $this->update($id, ['emails_sent_at' => Clock::iso()]);
            return true;
        } catch (Throwable $e) {
            $this->update($id, ['needs_attention' => 1]);
            return false;
        }
    }

    /** Archivo .ics para "Ajouter à mon agenda" (solo reservas confirmadas). */
    public function calendarFile($id, $token): string
    {
        $b = $this->findWithToken($id, $token);
        if (($b['status'] !== 'confirmed' && $b['status'] !== 'completed') || !$b['date']) throw new AppError('not_found', 404);
        return Ics::build($b, $b['lang'], $this->config['business_address']);
    }

    public function handleWebhook($body): void
    {
        if (!is_array($body)) return;
        $checkoutId = $body['id'] ?? ($body['payload']['checkout_id'] ?? null);
        if (!is_string($checkoutId) || $checkoutId === '') return;
        $b = $this->db->one('SELECT * FROM bookings WHERE checkout_id = ?', [$checkoutId]);
        if ($b) $this->sync($b);
    }

    public function publicStatus($id, $token): array
    {
        $b = $this->sync($this->findWithToken($id, $token));
        $services = json_decode($b['services_json'], true);
        $out = [
            'id' => $b['id'],
            'status' => $b['status'],
            'mode' => $b['mode'],
            'lang' => $b['lang'],
            'date' => $b['date'],
            'start' => $b['start'],
            'services' => array_map(fn($s) => ['id' => $s['id'], 'name' => $s['name'], 'priceCents' => $s['priceCents']], $services),
            'totalCents' => (int) $b['total_cents'],
            'depositCents' => (int) $b['deposit_cents'],
            'restCents' => (int) $b['total_cents'] - (int) $b['deposit_cents'],
            'paidFull' => (bool) (int) $b['pay_full'],
        ];
        if ($b['mode'] === 'gift') {
            // Datos para el mensaje que la compradora puede enviar al beneficiario
            $out['giftName'] = $b['gift_name'];
            $out['clientName'] = $b['client_name'];
            $out['giftMessage'] = $b['gift_message'] ?: null;
        }
        if (in_array($b['status'], ['confirmed', 'completed'], true) && $b['gift_code']) {
            $out['giftCode'] = $b['gift_code'];
            $out['giftExpiresAt'] = $b['gift_expires_at'];
            $out['giftLink'] = $this->giftLink($b);
        }
        if ($b['status'] === 'pending_payment') $out['holdExpiresAt'] = $b['hold_expires_at'];
        if ($b['status'] === 'confirmed' && $b['date']) $out['calendar'] = Ics::links($b, $this->config['public_url'], $this->config['business_address'], $b['lang']);
        return $out;
    }

    /** Enlace que recibe el beneficiario para elegir su día (debe confirmar su nombre y el código). */
    public function giftLink(array $b): string
    {
        return $this->config['public_url'] . '/?cadeau=' . rawurlencode((string) $b['gift_code']);
    }

    /* ---------------- Carte cadeau: el beneficiario elige su día ---------------- */

    private static function plain(string $s): string
    {
        $s = mb_strtolower(trim($s), 'UTF-8');
        if (function_exists('iconv')) $s = (string) @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $s);
        return trim(preg_replace('/[^a-z0-9]+/', ' ', $s) ?? '');
    }

    /** Busca la carte cadeau por código y comprueba el nombre del beneficiario (nombre completo o solo el nombre). */
    private function giftFor($code, $name): array
    {
        $norm = self::normalizeCode($code);
        $b = strlen($norm) === 8 ? $this->db->one("SELECT * FROM bookings WHERE gift_code = ? AND mode = 'gift'", ['NYG-' . substr($norm, 0, 4) . '-' . substr($norm, 4)]) : null;
        $given = self::plain((string) $name);
        $full = $b ? self::plain((string) $b['gift_name']) : '';
        $first = explode(' ', $full)[0] ?? '';
        if (!$b || $given === '' || ($given !== $full && $given !== $first)) throw new AppError('gift_not_found', 404);
        return $b;
    }

    private function giftState(array $b): string
    {
        if (in_array($b['status'], ['cancelled', 'refunded'], true)) return 'cancelled';
        if ($b['status'] !== 'confirmed' && $b['status'] !== 'completed' && $b['status'] !== 'no_show') return 'not_paid';
        if ($b['gift_redeemed_at'] || $b['status'] === 'completed') return 'used';
        if ($b['date']) return 'scheduled';
        if ($b['gift_expires_at'] && $b['gift_expires_at'] < $this->today()) return 'expired';
        return 'open';
    }

    /** Datos que ve el beneficiario tras confirmar nombre y código. */
    public function giftVerify($code, $name): array
    {
        $b = $this->giftFor($code, $name);
        $services = json_decode($b['services_json'], true);
        return [
            'state' => $this->giftState($b),
            'giftName' => $b['gift_name'],
            'clientName' => $b['client_name'],
            'lang' => $b['lang'],
            'services' => array_map(fn($s) => ['id' => $s['id'], 'name' => $s['name']], $services),
            'minutes' => (int) $b['minutes'],
            'totalCents' => (int) $b['total_cents'],
            'expiresAt' => $b['gift_expires_at'],
            'date' => $b['date'],
            'start' => $b['start'],
        ];
    }

    /** El beneficiario elige día y hora: queda reservado sin pagar nada más. */
    public function giftSchedule($code, $name, $date, $start): array
    {
        $b = $this->giftFor($code, $name);
        $state = $this->giftState($b);
        if ($state !== 'open') throw new AppError('gift_' . $state, 409);
        if (!Calendar::isDate($date)) throw new AppError('invalid_date');
        if (!Calendar::isTime($start)) throw new AppError('invalid_time');
        if ($b['gift_expires_at'] && $date > $b['gift_expires_at']) throw new AppError('gift_date_after_expiry', 409, ['expiresAt' => $b['gift_expires_at']]);

        $this->db->locked(function () use ($b, $date, $start) {
            $fresh = $this->find($b['id']);
            if ($fresh['date']) throw new AppError('gift_scheduled', 409);
            $avail = $this->day($date, (int) $fresh['minutes'], $fresh['id']);
            if (!in_array($start, $avail['slots'], true)) throw new AppError('slot_unavailable', 409);
            $this->update($fresh['id'], [
                'date' => $date,
                'start' => $start,
                'end' => Calendar::toTime(Calendar::toMin($start) + (int) $fresh['minutes']),
                'gift_scheduled_at' => Clock::iso(),
            ]);
        });

        $b = $this->find($b['id']);
        try {
            $this->mailer->sendAll($this->mailer->giftScheduledEmails($b));
        } catch (Throwable $e) {
            $this->update($b['id'], ['needs_attention' => 1]);
        }
        return [
            'state' => 'scheduled',
            'date' => $b['date'],
            'start' => $b['start'],
            'giftName' => $b['gift_name'],
            'services' => array_map(fn($s) => ['id' => $s['id'], 'name' => $s['name']], json_decode($b['services_json'], true)),
            'calendar' => Ics::links($b, $this->config['public_url'], $this->config['business_address'], $b['lang']),
        ];
    }

    /* ---------------- Panel de la empresa ---------------- */

    private function adminView(array $b): array
    {
        $b['services'] = json_decode($b['services_json'], true);
        unset($b['services_json'], $b['token']);
        foreach (['minutes', 'total_cents', 'deposit_cents', 'pay_full', 'needs_attention'] as $k) $b[$k] = (int) $b[$k];
        if ($b['gift_age'] !== null) $b['gift_age'] = (int) $b['gift_age'];
        if ($b['refunded_cents'] !== null) $b['refunded_cents'] = (int) $b['refunded_cents'];
        if ($b['mode'] === 'gift' && $b['gift_code']) $b['gift_link'] = $this->giftLink($b);
        return $b;
    }

    /** Cartes cadeau pagadas cuyo beneficiario aún no eligió su día. */
    public function giftsToSchedule(): array
    {
        $rows = $this->db->all("SELECT * FROM bookings WHERE mode = 'gift' AND status = 'confirmed' AND `date` IS NULL ORDER BY gift_expires_at, paid_at");
        return array_map([$this, 'adminView'], $rows);
    }

    public function list(array $q): array
    {
        $this->expireHolds();
        $f = Calendar::isDate($q['from'] ?? null) ? $q['from'] : $this->today();
        $t = Calendar::isDate($q['to'] ?? null) ? $q['to'] : Calendar::addDays($f, 60);
        $status = $q['status'] ?? null;
        $sql = 'SELECT * FROM bookings WHERE `date` BETWEEN ? AND ?';
        $args = [$f, $t];
        if ($status === 'active') $sql .= " AND status IN ('confirmed','pending_payment')";
        elseif (is_string($status) && preg_match('/^[a-z_]+$/', $status)) { $sql .= ' AND status = ?'; $args[] = $status; }
        else $sql .= " AND status NOT IN ('expired','payment_failed')";
        $sql .= ' ORDER BY `date`, `start`';
        return array_map([$this, 'adminView'], $this->db->all($sql, $args));
    }

    public function get(string $id): array { return $this->adminView($this->find($id)); }

    public function adminAction(string $id, $action, array $opts): array
    {
        $b = $this->find($id);
        $n = Clock::iso();
        switch ($action) {
            case 'complete':
                if (!in_array($b['status'], ['confirmed', 'no_show'], true)) throw new AppError('invalid_transition', 409);
                $this->update($id, ['status' => 'completed', 'balance_paid_at' => $n]);
                break;
            case 'no_show':
                if ($b['status'] !== 'confirmed') throw new AppError('invalid_transition', 409);
                $this->update($id, ['status' => 'no_show']);
                break;
            case 'cancel':
                if (!in_array($b['status'], ['confirmed', 'pending_payment'], true)) throw new AppError('invalid_transition', 409);
                $this->update($id, ['status' => 'cancelled', 'hold_expires_at' => null]);
                if (!empty($opts['notify']) && $b['status'] === 'confirmed') {
                    try { $this->mailer->sendAll($this->mailer->cancellationEmails($this->find($id))); } catch (Throwable $e) { /* ya registrado */ }
                }
                break;
            case 'reopen':
                if (!in_array($b['status'], ['completed', 'no_show', 'cancelled'], true) || !$b['paid_at']) throw new AppError('invalid_transition', 409);
                $this->update($id, ['status' => 'confirmed', 'balance_paid_at' => null]);
                break;
            case 'resolve':
                $this->update($id, ['needs_attention' => 0]);
                break;
            case 'note':
                $note = self::cleanText($opts['note'] ?? null, 1000);
                $this->update($id, ['admin_note' => $note !== '' ? $note : null]);
                break;
            case 'resend':
                if (!in_array($b['status'], ['confirmed', 'completed'], true)) throw new AppError('invalid_transition', 409);
                if (!$this->sendConfirmation($id)) throw new AppError('mail_failed', 502);
                break;
            case 'refund':
                // Reembolso acordado por WhatsApp (hasta 48 h antes). El dinero se devuelve desde SumUp;
                // aquí se registra y se libera el horario.
                if (!in_array($b['status'], ['confirmed', 'cancelled', 'no_show'], true) || !$b['paid_at']) throw new AppError('invalid_transition', 409);
                $amount = $opts['amount'] ?? null;
                if (is_string($amount)) $amount = str_replace(',', '.', trim($amount));
                $cents = ($amount === null || $amount === '') ? (int) $b['deposit_cents'] : (int) round(((float) $amount) * 100);
                if (!is_numeric($amount ?? 0) || $cents <= 0 || $cents > (int) $b['deposit_cents']) throw new AppError('invalid_amount', 400, ['max' => (int) $b['deposit_cents']]);
                $note = trim(($b['admin_note'] ? $b['admin_note'] . "\n" : '') . 'Remboursé ' . Ics::eur($cents, 'fr') . ' le ' . substr($n, 0, 10)
                    . (($r = self::cleanText($opts['note'] ?? null, 300)) !== '' ? ' · ' . $r : ''));
                $this->update($id, ['status' => 'refunded', 'refunded_cents' => $cents, 'refunded_at' => $n, 'hold_expires_at' => null, 'admin_note' => mb_substr($note, 0, 1000)]);
                break;
            case 'unschedule':
                // Carte cadeau: libera la fecha para que el beneficiario elija otra con su enlace
                if ($b['mode'] !== 'gift' || $b['status'] !== 'confirmed' || !$b['date']) throw new AppError('invalid_transition', 409);
                $this->update($id, ['date' => null, 'start' => null, 'end' => null, 'gift_scheduled_at' => null]);
                break;
            default:
                throw new AppError('invalid_action');
        }
        return $this->get($id);
    }

    public function giftLookup($code): array
    {
        $norm = self::normalizeCode($code);
        if (strlen($norm) !== 8) throw new AppError('not_found', 404);
        $b = $this->db->one('SELECT * FROM bookings WHERE gift_code = ?', ['NYG-' . substr($norm, 0, 4) . '-' . substr($norm, 4)]);
        if (!$b) throw new AppError('not_found', 404);
        $t = $this->today();
        return [
            'booking' => $this->adminView($b),
            'scheduled' => (bool) $b['date'],
            'validToday' => $b['date'] === $t,
            'expired' => $b['date'] ? $b['date'] < $t : ($b['gift_expires_at'] && $b['gift_expires_at'] < $t),
            'redeemed' => (bool) $b['gift_redeemed_at'],
        ];
    }

    public function giftRedeem($code, bool $force): array
    {
        $info = $this->giftLookup($code);
        $b = $info['booking'];
        if ($info['redeemed']) throw new AppError('already_redeemed', 409);
        if (!in_array($b['status'], ['confirmed', 'no_show'], true)) throw new AppError('not_valid', 409);
        if (!$info['validToday'] && !$force) throw new AppError('wrong_date', 409, ['date' => $b['date']]);
        $this->update($b['id'], ['gift_redeemed_at' => Clock::iso()]);
        return $this->giftLookup($code);
    }

    private function blockRows(string $from, string $to): array
    {
        $rows = $this->db->all('SELECT id, `date`, `start`, `end`, reason FROM blocks WHERE `date` BETWEEN ? AND ? ORDER BY `date`, `start`', [$from, $to]);
        foreach ($rows as &$r) $r['id'] = (int) $r['id'];
        return $rows;
    }

    public function blocks($from, $to): array
    {
        $f = Calendar::isDate($from) ? $from : $this->today();
        $t = Calendar::isDate($to) ? $to : Calendar::addDays($f, 120);
        return $this->blockRows($f, $t);
    }

    public function addBlock(array $in): array
    {
        $date = $in['date'] ?? null; $start = $in['start'] ?? null; $end = $in['end'] ?? null;
        if (!Calendar::isDate($date)) throw new AppError('invalid_date');
        $whole = !$start && !$end;
        if (!$whole && (!Calendar::isTime($start) || !Calendar::isTime($end) || Calendar::toMin($start) >= Calendar::toMin($end))) {
            throw new AppError('invalid_time');
        }
        $reason = self::cleanText($in['reason'] ?? null, 200);
        $this->db->run('INSERT INTO blocks (`date`, `start`, `end`, reason, created_at) VALUES (?,?,?,?,?)',
            [$date, $whole ? null : $start, $whole ? null : $end, $reason !== '' ? $reason : null, Clock::iso()]);
        $newId = (int) $this->db->pdo->lastInsertId();

        // Reservas que caen dentro del bloqueo (hay que avisarlas a mano)
        $rows = $this->db->all("SELECT * FROM bookings WHERE `date` = ? AND status IN ('confirmed','pending_payment')", [$date]);
        $affected = array_values(array_filter($rows, fn($b) => $whole
            || (Calendar::toMin($b['start']) < Calendar::toMin($end) && Calendar::toMin($b['end']) > Calendar::toMin($start))));
        return ['id' => $newId, 'affected' => array_map([$this, 'adminView'], $affected)];
    }

    public function removeBlock($id): void
    {
        if ($this->db->run('DELETE FROM blocks WHERE id = ?', [(int) $id]) === 0) throw new AppError('not_found', 404);
    }

    public function adminMonth($ym): array
    {
        if (!is_string($ym) || !preg_match('/^\d{4}-\d{2}$/', $ym)) throw new AppError('invalid_month');
        [$y, $m] = array_map('intval', explode('-', $ym));
        if ($m < 1 || $m > 12) throw new AppError('invalid_month');
        $settings = $this->db->getSettings();
        $n = (int) gmdate('t', gmmktime(0, 0, 0, $m, 1, $y));
        $first = $ym . '-01'; $last = sprintf('%s-%02d', $ym, $n);
        $counts = [];
        foreach ($this->db->all("SELECT `date`, COUNT(*) AS n FROM bookings WHERE `date` BETWEEN ? AND ?
            AND status IN ('confirmed','pending_payment','completed','no_show') GROUP BY `date`", [$first, $last]) as $r) {
            $counts[$r['date']] = (int) $r['n'];
        }
        $blockList = $this->blockRows($first, $last);
        $days = [];
        for ($d = 1; $d <= $n; $d++) {
            $key = sprintf('%s-%02d', $ym, $d);
            $days[] = [
                'date' => $key,
                'holiday' => Calendar::holidayName($key),
                'closed' => count($settings['openingHours'][(string) Calendar::weekday($key)] ?? []) === 0,
                'blocks' => array_values(array_filter($blockList, fn($b) => $b['date'] === $key)),
                'bookings' => $counts[$key] ?? 0,
            ];
        }
        return ['month' => $ym, 'today' => $this->today(), 'days' => $days];
    }
}
