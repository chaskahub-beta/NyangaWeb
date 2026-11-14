<?php
/*
  Punto de entrada de la API: /api/* → aquí (ver public_html/.htaccess).
  La aplicación vive FUERA de public_html, en la carpeta hermana nyanga-app/.
*/
declare(strict_types=1);

// Requisitos del hosting (cPanel → Seleccionar versión de PHP → Extensiones)
$missing = [];
if (PHP_VERSION_ID < 80100) $missing[] = 'php>=8.1 (actual ' . PHP_VERSION . ')';
foreach (['pdo_mysql', 'curl', 'mbstring', 'openssl', 'json'] as $ext) {
    if (!extension_loaded($ext)) $missing[] = $ext;
}
if ($missing) {
    http_response_code(503);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'php_requirements', 'missing' => $missing]);
    exit;
}

$appDir = dirname(__DIR__, 2) . '/nyanga-app';
if (!is_file($appDir . '/bootstrap.php')) {
    http_response_code(503);
    header('Content-Type: application/json');
    echo '{"error":"app_missing"}';
    exit;
}
require $appDir . '/bootstrap.php';

ini_set('display_errors', '0');
header('X-Content-Type-Options: nosniff');

try {
    $config = Config::load();
    Clock::init($config);

    // Ruta tras /api/ (funciona tanto en la raíz del dominio como en una subcarpeta)
    $uri = (string) parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);
    $pos = strpos($uri, '/api/');
    $path = $pos === false ? '' : trim(substr($uri, $pos + 5), '/');
    $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));

    (new Api($config))->handle($method, $path);
} catch (AppError $e) {
    Api::json(['error' => $e->errorCode] + $e->extra, $e->status);
} catch (Throwable $e) {
    error_log('[nyanga] ' . get_class($e) . ': ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    Api::json(['error' => 'server_error'], 500);
}
