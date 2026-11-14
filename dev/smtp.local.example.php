<?php
/*
  Envío de correos REALES desde el Docker local.
  1. Copia este archivo como smtp.local.php (misma carpeta). Ese archivo no se sube a ningún sitio.
  2. Rellena tu buzón. Ejemplo con Gmail:
     - activa la verificación en 2 pasos en tu cuenta de Google;
     - crea una "contraseña de aplicación" en https://myaccount.google.com/apppasswords;
     - pégala en 'pass' (no uses tu contraseña normal).
  3. Reinicia: docker compose -f dev/docker-compose.yml restart web
  Con Hostinet será lo mismo con host mail.tu-dominio y el buzón del dominio.
*/
return [
    'host' => 'smtp.gmail.com',
    'port' => 465,                       // SSL, igual que en Hostinet
    'user' => 'tu-cuenta@gmail.com',
    'pass' => '',                        // contraseña de aplicación (16 letras)
    'from' => 'Nyanga Beauty & Spa <tu-cuenta@gmail.com>',  // con Gmail debe ser la misma cuenta
    'company_email' => 'tu-cuenta@gmail.com',              // dónde llega el aviso "nueva reserva"
];
