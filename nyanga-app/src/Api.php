<?php
declare(strict_types=1);

/*
  Rutas /api/* (mismas que la versión Node, para que el sitio y el panel funcionen igual).
*/
final class Api
{
    private array $config;
    private ?Db $db = null;

    public function __construct(array $config) { $this->config = $config; }

    private function db(): Db { return $this->db ??= new Db($this->config['db']); }

    private function services(): array
    {
        $db = $this->db();
        Catalog::useDb($db);
        $payments = new SumUp($this->config, $db);
        return [$db, $payments, new Bookings($this->config, $db, $payments, new Mailer($this->config)), new Auth($this->config, $db)];
    }

    private static function body(): array
    {
        $len = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
        if ($len > 20 * 1024) throw new AppError('too_large', 413);
        $raw = (string) file_get_contents('php://input', false, null, 0, 20 * 1024 + 1);
        if (strlen($raw) > 20 * 1024) throw new AppError('too_large', 413);
        if (trim($raw) === '') return [];
        $data = json_decode($raw, true);
        if (!is_array($data)) throw new AppError('invalid_json', 400);
        return $data;
    }

    private static function minutes(): ?int
    {
        $m = $_GET['minutes'] ?? '';
        return is_string($m) && ctype_digit($m) ? (int) $m : null;
    }

    private static function ip(): string { return (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown'); }

    public static function json($data, int $status = 200): void
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    /** @return array{0:mixed,1:int}|null  [respuesta, estado] o null si no hay ruta */
    public function handle(string $method, string $path): void
    {
        $m = [];
        // Salud (para el alojamiento)
        if ($method === 'GET' && $path === 'health') {
            $this->db()->one('SELECT 1 AS ok');
            self::json(['ok' => true]);
            return;
        }

        if (str_starts_with($path, 'admin/') || $path === 'admin') {
            header('Cache-Control: no-store');
            $this->admin($method, substr($path, 6));
            return;
        }

        [$db, $payments, $bookings] = $this->services();

        if ($method === 'GET' && $path === 'catalog') {
            // Siempre al día: la empresa cambia soins y horarios desde el panel
            header('Cache-Control: no-cache');
            $cat = Catalog::data();
            self::json([
                'depositRate' => (float) $this->config['deposit_rate'],
                'categories' => $cat['categories'],
                'services' => $cat['services'],
                'hours' => (object) $db->getSettings()['openingHours'],
            ]);
            return;
        }
        if ($method === 'GET' && $path === 'availability') {
            self::json($bookings->month((string) ($_GET['month'] ?? ''), self::minutes()));
            return;
        }
        if ($method === 'GET' && $path === 'availability/day') {
            self::json($bookings->day((string) ($_GET['date'] ?? ''), self::minutes()));
            return;
        }
        if ($method === 'POST' && $path === 'bookings') {
            RateLimit::enforce($db, 'book:' . self::ip(), 20, 3600);
            self::json($bookings->create(self::body()), 201);
            return;
        }
        if ($method === 'GET' && preg_match('#^bookings/([^/]+)$#', $path, $m)) {
            header('Cache-Control: no-store');
            self::json($bookings->publicStatus(rawurldecode($m[1]), (string) ($_GET['t'] ?? '')));
            return;
        }
        if ($method === 'GET' && preg_match('#^bookings/([^/]+)/calendar\.ics$#', $path, $m)) {
            $ics = $bookings->calendarFile(rawurldecode($m[1]), (string) ($_GET['t'] ?? ''));
            header('Cache-Control: no-store');
            header('Content-Type: text/calendar; charset=utf-8');
            header('Content-Disposition: attachment; filename="nyanga-rendez-vous.ics"');
            echo $ics;
            return;
        }
        if ($method === 'POST' && preg_match('#^bookings/([^/]+)/pay$#', $path, $m)) {
            RateLimit::enforce($db, 'pay:' . self::ip(), 20, 3600);
            $b = self::body();
            self::json($bookings->retryPayment(rawurldecode($m[1]), (string) ($b['t'] ?? '')));
            return;
        }
        // Carte cadeau: el beneficiario confirma su nombre y el código, y elige su día
        if ($method === 'POST' && $path === 'gift/verify') {
            RateLimit::enforce($db, 'giftv:' . self::ip(), 30, 3600);
            $in = self::body();
            self::json($bookings->giftVerify($in['code'] ?? '', $in['name'] ?? ''));
            return;
        }
        if ($method === 'POST' && $path === 'gift/schedule') {
            RateLimit::enforce($db, 'gifts:' . self::ip(), 20, 3600);
            $in = self::body();
            self::json($bookings->giftSchedule($in['code'] ?? '', $in['name'] ?? '', $in['date'] ?? null, $in['start'] ?? null));
            return;
        }

        // Aviso de SumUp: siempre se vuelve a consultar el cobro
        if ($method === 'POST' && $path === 'payments/sumup/webhook') {
            try { $bookings->handleWebhook(self::body()); } catch (AppError $e) { /* aviso mal formado: se ignora */ }
            self::json(['ok' => true]);
            return;
        }
        // Solo en modo simulado: la página de pago de prueba marca el resultado
        if ($payments->mode() === 'mock') {
            if ($method === 'POST' && $path === 'dev/mock-pay') {
                $in = self::body();
                $b = $bookings->findWithToken($in['id'] ?? '', (string) ($in['t'] ?? ''));
                if (!$b['checkout_id']) { self::json(['error' => 'no_checkout'], 409); return; }
                $payments->mockSetStatus($b['checkout_id'], ($in['result'] ?? '') === 'fail' ? 'FAILED' : 'PAID');
                $bookings->handleWebhook(['id' => $b['checkout_id']]);
                self::json(['ok' => true]);
                return;
            }
            if ($method === 'GET' && preg_match('#^dev/mock-pay/([^/]+)$#', $path, $m)) {
                $s = $bookings->publicStatus(rawurldecode($m[1]), (string) ($_GET['t'] ?? ''));
                self::json(['depositCents' => $s['depositCents'], 'status' => $s['status'], 'date' => $s['date'], 'start' => $s['start']]);
                return;
            }
        }
        throw new AppError('not_found', 404);
    }

    private function admin(string $method, string $path): void
    {
        [$db, , $bookings, $auth] = $this->services();
        $path = ltrim($path, '/');
        $m = [];

        if ($method === 'POST' && $path === 'login') {
            $in = self::body();
            $auth->login((string) ($in['password'] ?? ''), self::ip());
            self::json(['ok' => true]);
            return;
        }
        if ($method === 'POST' && $path === 'logout') { $auth->clear(); self::json(['ok' => true]); return; }
        if ($method === 'GET' && $path === 'session') {
            self::json(['authenticated' => $auth->isValid(), 'paymentsMode' => $this->config['payments_mode'], 'mailMode' => $this->config['mail_mode']]);
            return;
        }

        $auth->guard();

        if ($method === 'GET' && $path === 'bookings') {
            self::json($bookings->list(['from' => $_GET['from'] ?? null, 'to' => $_GET['to'] ?? null, 'status' => $_GET['status'] ?? null]));
            return;
        }
        if ($method === 'GET' && preg_match('#^bookings/([^/]+)$#', $path, $m)) { self::json($bookings->get(rawurldecode($m[1]))); return; }
        if ($method === 'POST' && preg_match('#^bookings/([^/]+)/action$#', $path, $m)) {
            $in = self::body();
            self::json($bookings->adminAction(rawurldecode($m[1]), $in['action'] ?? null, ['notify' => ($in['notify'] ?? null) === true, 'note' => $in['note'] ?? null, 'amount' => $in['amount'] ?? null]));
            return;
        }
        if ($method === 'GET' && $path === 'calendar') { self::json($bookings->adminMonth((string) ($_GET['month'] ?? ''))); return; }
        if ($method === 'GET' && $path === 'blocks') { self::json($bookings->blocks($_GET['from'] ?? null, $_GET['to'] ?? null)); return; }
        if ($method === 'POST' && $path === 'blocks') { self::json($bookings->addBlock(self::body()), 201); return; }
        if ($method === 'DELETE' && preg_match('#^blocks/(\d+)$#', $path, $m)) { $bookings->removeBlock($m[1]); self::json(['ok' => true]); return; }
        if ($method === 'GET' && $path === 'gifts/pending') { self::json($bookings->giftsToSchedule()); return; }
        if ($method === 'GET' && preg_match('#^gift/([^/]+)$#', $path, $m)) { self::json($bookings->giftLookup(rawurldecode($m[1]))); return; }
        if ($method === 'POST' && preg_match('#^gift/([^/]+)/redeem$#', $path, $m)) {
            $in = self::body();
            self::json($bookings->giftRedeem(rawurldecode($m[1]), !empty($in['force'])));
            return;
        }
        // Soins: precio, nombre, descripción, duración, categoría y orden
        $svc = new ServicesAdmin($db);
        if ($method === 'GET' && $path === 'services') { self::json($svc->list()); return; }
        if ($method === 'POST' && $path === 'services') { self::json($svc->create(self::body()), 201); return; }
        if ($method === 'POST' && $path === 'services/order') { self::json($svc->reorder(self::body()['ids'] ?? null)); return; }
        if ($method === 'PUT' && preg_match('#^services/([a-z0-9-]+)$#', $path, $m)) { self::json($svc->update($m[1], self::body())); return; }
        if ($method === 'DELETE' && preg_match('#^services/([a-z0-9-]+)$#', $path, $m)) { $svc->delete($m[1]); self::json(['ok' => true]); return; }

        if ($method === 'GET' && $path === 'settings') { self::json(self::settingsOut($db->getSettings())); return; }
        if ($method === 'PUT' && $path === 'settings') {
            $next = self::validateSettings(self::body(), $db->getSettings());
            $db->saveSettings($next);
            self::json(self::settingsOut($next));
            return;
        }
        throw new AppError('not_found', 404);
    }

    private static function settingsOut(array $s): array
    {
        $s['openingHours'] = (object) $s['openingHours'];
        return $s;
    }

    private static function validateSettings(array $in, array $current): array
    {
        $out = $current;
        if (isset($in['openingHours'])) {
            if (!is_array($in['openingHours'])) throw new AppError('invalid_hours');
            $hours = [];
            for ($d = 0; $d <= 6; $d++) {
                $list = $in['openingHours'][$d] ?? $in['openingHours'][(string) $d] ?? [];
                if (!is_array($list) || count($list) > 3) throw new AppError('invalid_hours');
                $day = [];
                foreach ($list as $pair) {
                    if (!is_array($pair) || !Calendar::isTime($pair[0] ?? null) || !Calendar::isTime($pair[1] ?? null)
                        || Calendar::toMin($pair[0]) >= Calendar::toMin($pair[1])) throw new AppError('invalid_hours');
                    $day[] = [$pair[0], $pair[1]];
                }
                usort($day, fn($a, $b) => Calendar::toMin($a[0]) <=> Calendar::toMin($b[0]));
                for ($i = 1; $i < count($day); $i++) {
                    if (Calendar::toMin($day[$i][0]) < Calendar::toMin($day[$i - 1][1])) throw new AppError('invalid_hours');
                }
                $hours[(string) $d] = $day;
            }
            $out['openingHours'] = $hours;
        }
        if (array_key_exists('slotStep', $in)) {
            $v = is_numeric($in['slotStep']) ? (int) $in['slotStep'] : 0;
            if (!in_array($v, [15, 30, 45, 60], true)) throw new AppError('invalid_step');
            $out['slotStep'] = $v;
        }
        if (array_key_exists('bufferMinutes', $in)) {
            $v = $in['bufferMinutes'];
            if (!is_numeric($v) || (int) $v != $v || (int) $v < 0 || (int) $v > 120) throw new AppError('invalid_buffer');
            $out['bufferMinutes'] = (int) $v;
        }
        return $out;
    }
}
