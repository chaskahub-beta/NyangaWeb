# Nyanga Beauty & Spa — versión PHP (para Hostinet)

La misma web que la versión Node: sitio, reservas con agenda real, cartes cadeau, pago del 20 % con SumUp, correos con el `.ics` y panel de la empresa en `/admin`. Funciona en cualquier hosting compartido con **PHP 8.1 o superior y MySQL**, sin Composer ni comandos.

## Qué hay aquí

| Carpeta | Dónde va en el hosting |
|---|---|
| `public_html/` | Su **contenido** va dentro de `public_html` (la web pública). |
| `nyanga-app/` | La carpeta entera va **al lado** de `public_html`, nunca dentro. Ahí están el código, la configuración y las contraseñas. |
| `dev/` | Solo para probar en este PC con Docker. **No se sube.** |
| `docs/` + `demo/` | Demo estática para la clienta en GitHub Pages: `node demo/build-demo.mjs` la regenera y `node demo/serve-demo.mjs` la muestra en http://localhost:5600/NyangaWeb/. **No se sube al hosting.** |

En el hosting debe quedar así:

```
/home/tu-usuario/
├── public_html/        ← index.html, css/, js/, img/, admin/, api/, .htaccess …
└── nyanga-app/         ← bootstrap.php, src/, config.php, storage/ …
```

## Instalación en Hostinet (cPanel)

1. **PHP**: *cPanel → Seleccionar versión de PHP* → **8.2** (sirve de 8.1 en adelante). Comprueba que estén activas las extensiones `pdo_mysql`, `curl`, `mbstring` y `openssl`; suelen venir activas.
2. **Base de datos**: *cPanel → Bases de datos MySQL*:
   - crea una base de datos, por ejemplo `nyanga`;
   - crea un usuario con una contraseña larga;
   - en «Añadir usuario a la base de datos» dale **todos los privilegios**.

   cPanel añade un prefijo a los nombres (ej. `usuario_nyanga`): apunta los nombres completos.
3. **Correo**: *cPanel → Cuentas de correo* → crea `reservations@tu-dominio` (envía las confirmaciones) y el buzón que recibirá los avisos, por ejemplo `contact@tu-dominio`.
4. **Subir archivos** (*Administrador de archivos* o FTP):
   - el contenido de `public_html/` dentro de `public_html/`; activa «Mostrar archivos ocultos» para que se suba el `.htaccess`;
   - la carpeta `nyanga-app/` en la carpeta de inicio, junto a `public_html`.
5. **Configuración**: en `nyanga-app/`, copia `config.example.php` como **`config.php`** y rellénalo:
   - `public_url`: `https://tu-dominio`;
   - `db`: los nombres completos del paso 2;
   - `admin_password`: la contraseña del panel;
   - `session_secret`: un texto aleatorio largo;
   - `mail`: `host` = `mail.tu-dominio`, `port` = `465`, `user` / `pass` = el buzón `reservations@`, y `company_email`.
6. **SSL**: *cPanel → SSL/TLS Status* → «Run AutoSSL», si el certificado aún no está activo.
7. **Comprobar**: abre `https://tu-dominio/api/health`.
   - Debe responder `{"ok":true}`; la primera vez crea las tablas.
   - Si responde `php_requirements`, indica qué extensión falta.
   - Si responde `config_missing`, falta el `config.php`.
   - Si responde `db_unavailable`, revisa los datos de la base.
8. **SumUp** (cuando la empresa dé los datos): pon `api_key` (`sk_…`) y `merchant_code` en `config.php`. Mientras estén vacíos, el pago es **simulado**.

El panel está en `https://tu-dominio/admin`. Desde ahí la empresa gestiona:

- **Agenda**: las reservas.
- **Calendrier**: días y franjas bloqueados.
- **Cartes cadeau**: validar los códigos.
- **Soins**: precio, nombre, descripción, duraciones, categoría y orden de cada soin. También puede añadir, ocultar o borrar soins. Los cambios se ven al instante en la web; las reservas ya hechas conservan su nombre y su precio.
- **Réglages**: horarios de apertura (también se muestran en la sección Contact), intervalo entre citas y pausa entre clientas.

La primera vez, los soins se copian de `nyanga-app/catalog.json` a la base de datos; después ese archivo solo se usa para la demo de GitHub.

### Carte cadeau y reembolsos

- **Carte cadeau:** se paga al 100 % y vale 1 año. El beneficiario recibe un correo con un enlace (`/?cadeau=CÓDIGO`). Ahí confirma su nombre y el código y elige día y hora; se le envía la confirmación a él y a la empresa. En el panel, *Cartes cadeau → À planifier* lista las tarjetas aún sin fecha, con su enlace para copiar. Desde la ficha se puede **liberar la fecha** para que el beneficiario elija otra.
- **Reembolsos:** solo hasta 48 h antes y solo por WhatsApp. En la ficha de la reserva, **Rembourser** registra el importe y libera el horario. El dinero se devuelve desde la cuenta SumUp de la empresa.

### Foto de la entrada

Guardar la foto como `public_html/img/acces.webp`: aparece sola en Contact, encima del mapa.

## Copias de seguridad

El plan no incluye copias automáticas, así que hazlas tú:

- **Base de datos**: *cPanel → phpMyAdmin* → base `…_nyanga` → **Exportar**. O bien *cPanel → Copia de seguridad* → descargar la base MySQL.
- `nyanga-app/config.php`: guarda una copia en un lugar seguro.

## Probar en este PC (Docker)

```bash
docker compose -f dev/docker-compose.yml up -d --build
node --test dev/api.test.mjs
```

- Sitio: http://localhost:8080
- Panel: http://localhost:8080/admin (contraseña `nyanga-dev`)
- Correos de prueba: http://localhost:8025

### Correos en local: servidor ficticio `mail.nyanga.test`

El Docker trae un servidor de correo de prueba (Mailpit) configurado como el de Hostinet: **puerto 465 con SSL obligatorio, usuario y contraseña**. La web envía con el buzón ficticio `reservations@nyanga.test` (contraseña `Nyanga-Test-2026`, solo vale para este servidor de prueba).

- Rechaza una contraseña incorrecta o un certificado SSL que no sea de confianza, igual que un servidor real.
- No entrega nada a internet: todos los correos (a clientas, beneficiarios y `contact@nyanga.test`) se ven en **http://localhost:8025**.
- El certificado de prueba está en `dev/certs/` y solo sirve en local.

### (Opcional) Enviar a buzones reales

Para que los correos salgan de verdad a internet, con el mismo método SMTP + SSL que usará Hostinet:

1. Copia `dev/smtp.local.example.php` como `dev/smtp.local.php` y pon tu buzón. Con Gmail usa una contraseña de aplicación. Este archivo no se sube nunca.
2. Envía un correo de prueba:

```bash
docker compose -f dev/docker-compose.yml exec web php /var/www/dev/test-mail.php tu-correo@ejemplo.com
```

Si sale `OK`, revisa la bandeja de entrada (y la de spam). Desde ese momento, las reservas hechas en http://localhost:8080 envían correos reales.

## Diferencias con la versión Node

- **MySQL en vez de SQLite.** Las tablas se crean solas; el esquema está en `nyanga-app/schema.sql`.
- **Configuración**: `config.php` en vez de `.env`.
- **Correos**: los envía el buzón del dominio por SMTP. Sin SMTP, se guardan en `nyanga-app/storage/outbox/`.
- **Retenciones de 30 minutos**: no hace falta tarea programada (cron), porque las retenciones caducadas se liberan en cada reserva.
- **Catálogo**: precios, duraciones y textos de los soins están en `nyanga-app/catalog.json`.
