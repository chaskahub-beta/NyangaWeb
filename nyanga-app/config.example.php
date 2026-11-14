<?php
/*
  Configuración de Nyanga Beauty & Spa (versión PHP).
  Copiar este archivo como config.php (en la misma carpeta) y rellenar los valores.
  config.php NO está dentro de public_html: nadie puede verlo desde la web.
*/

return [
    // Dirección pública del sitio, en https:// y sin barra final
    'public_url' => 'https://www.mi-dominio.fr',

    // Dirección que aparece en el evento de agenda (.ics / Google)
    'business_address' => 'Nyanga Beauty & Spa, Granges-Narboz, France',

    // Base de datos MySQL (cPanel → Bases de datos MySQL)
    'db' => [
        'host' => 'localhost',
        'name' => 'usuario_nyanga',
        'user' => 'usuario_nyanga',
        'pass' => '',
    ],

    // Panel de la empresa (/admin)
    'admin_password' => '',      // contraseña del panel (larga)
    'session_secret' => '',      // texto aleatorio largo (mín. 32 caracteres)

    // SumUp: clave API secreta (sk_...) y código de comerciante.
    // Vacío = modo simulado (página de pago de prueba).
    'sumup' => [
        'api_key' => '',
        'merchant_code' => '',
        'api_base' => 'https://api.sumup.com',
    ],

    // Correo: buzón del dominio creado en cPanel (Cuentas de correo).
    // Vacío = los correos se guardan en nyanga-app/storage/outbox para revisarlos.
    'mail' => [
        'host' => '',                // ej. mail.mi-dominio.fr
        'port' => 465,               // 465 = SSL, 587 = STARTTLS
        'user' => '',                // ej. reservations@mi-dominio.fr
        'pass' => '',
        'from' => 'Nyanga Beauty & Spa <reservations@mi-dominio.fr>',
        'company_email' => 'contact@mi-dominio.fr',   // recibe los avisos de reservas
    ],

    // Reglas del negocio
    'deposit_rate' => 0.2,
    'booking_window_days' => 90,
    'hold_minutes' => 30,
];
