<?php
/*
  Envía un correo de prueba (con el .ics adjunto) usando la configuración actual.
    docker compose -f dev/docker-compose.yml exec web php /var/www/dev/test-mail.php destinatario@ejemplo.com
*/
declare(strict_types=1);

require '/var/www/nyanga-app/bootstrap.php';

$to = $argv[1] ?? '';
if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
    fwrite(STDERR, "Uso: php test-mail.php destinatario@ejemplo.com\n");
    exit(1);
}

$config = Config::load();
echo "Modo de correo: {$config['mail_mode']}  ·  servidor: {$config['mail']['host']}:{$config['mail']['port']}\n";

$b = [
    'id' => 'PRUEBA', 'token' => 'x', 'lang' => 'fr', 'mode' => 'me',
    'date' => '2026-12-01', 'start' => '10:00', 'end' => '11:00',
    'services_json' => json_encode([['id' => 'relaxant', 'name' => ['fr' => 'Massage relaxant', 'en' => 'Relaxing massage'], 'priceCents' => 5000]]),
    'total_cents' => 5000, 'deposit_cents' => 1000,
    'client_name' => 'Test Nyanga', 'client_email' => $to, 'client_phone' => '0600000000',
    'gift_name' => null, 'gift_age' => null, 'gift_email' => null, 'gift_message' => null, 'gift_code' => null,
    'needs_attention' => 0,
];

try {
    $mailer = new Mailer($config);
    $mails = $mailer->confirmationEmails($b);
    $mailer->send($mails[0]);   // solo el correo de la clienta
    echo "OK: correo de prueba enviado a $to\n";
} catch (Throwable $e) {
    echo "ERROR: " . $e->getMessage() . "\n";
    exit(1);
}
