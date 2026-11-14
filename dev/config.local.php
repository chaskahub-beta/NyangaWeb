<?php
// Configuración SOLO para la prueba local con Docker (dev/docker-compose.yml).
$config = [
    'public_url' => 'http://localhost:8080',
    'db' => ['host' => 'db', 'name' => 'nyanga', 'user' => 'nyanga', 'pass' => 'nyanga-dev'],
    'admin_password' => 'nyanga-dev',
    'session_secret' => 'local-dev-secret-0123456789abcdef',
    // Buzón FICTICIO en el servidor de prueba mail.nyanga.test (Mailpit), igual que en Hostinet:
    // SSL en el puerto 465 + usuario y contraseña. Los correos se ven en http://localhost:8025
    'mail' => [
        'host' => 'mail.nyanga.test',
        'port' => 465,
        'user' => 'reservations@nyanga.test',
        'pass' => 'Nyanga-Test-2026',              // contraseña ficticia, solo para este servidor de prueba
        'from' => 'Nyanga Beauty & Spa <reservations@nyanga.test>',
        'company_email' => 'contact@nyanga.test',
        'cafile' => '/var/www/dev/certs/ca.crt',   // certificado de prueba (en Hostinet no hace falta)
    ],
    // Permite fijar la hora con la cabecera X-Test-Now (solo pruebas)
    'test_clock' => true,
];

// Correos REALES: si existe dev/smtp.local.php (copia de smtp.local.example.php), se usa ese buzón
$real = '/var/www/dev/smtp.local.php';   // carpeta dev/ montada en el contenedor
if (is_file($real)) {
    $config['mail'] = array_replace($config['mail'], require $real);
}
return $config;
