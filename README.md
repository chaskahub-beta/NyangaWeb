# Nyanga Beauty & Spa

Sitio web con reservas, cartas regalo y pago del 20 % con SumUp, más un panel para la empresa.

## Arrancar en local

Requisitos: Node.js 22.13 o superior (usa SQLite integrado en Node).

```bash
npm install
cp .env.example .env    # y rellenar los valores
npm start
```

- Sitio: http://localhost:5500
- Panel de la empresa: http://localhost:5500/admin (contraseña = `ADMIN_PASSWORD` del `.env`)
- Pruebas automáticas: `npm test`

Sin clave de SumUp, el pago es **simulado**: se abre una página de prueba con los botones "paiement réussi" o "refusé".
Sin SMTP, los correos **no se envían**: se guardan como `.html` en `data/outbox/` para revisarlos.

## Cómo funciona una reserva

1. La clienta elige *pour moi* o *carte cadeau*, los soins, el día y la hora (agenda real), y sus datos.
2. El servidor recalcula el precio, comprueba que el horario sigue libre y lo **retiene 30 minutos**.
3. Se crea un cobro SumUp por el **20 %** y la clienta va al enlace de pago de SumUp.
4. SumUp avisa al servidor (`/api/payments/sumup/webhook`) y la clienta vuelve a `/?reservation=…`.
   El servidor **siempre vuelve a consultar el estado del cobro en SumUp** y comprueba el importe.
5. Con el pago confirmado:
   - Reserva normal: correo a la clienta y a la empresa.
   - Carte cadeau: código único `NYG-XXXX-XXXX`, válido solo en la fecha elegida, enviado al comprador, al beneficiario y a la empresa.
   - **Agenda**: los correos (a quien asiste y a la empresa) llevan el evento `.ics` adjunto y botones
     *iPhone · Android* (`/api/bookings/:id/calendar.ics?t=…`) y *Google Agenda*. El `.ics` incluye
     recordatorios la víspera y 2 h antes. Si se anula, el correo lleva un `.ics` de anulación que lo quita.
     La dirección del evento sale de `BUSINESS_ADDRESS`.
6. Si el pago falla o caduca, el horario se libera y la clienta puede reintentar desde la misma página.

El 20 % no es reembolsable (la clienta lo acepta antes de pagar). El resto se paga en el lugar.

## Panel de la empresa (/admin)

- **Agenda**: próximos rendez-vous, ficha completa, marcar *terminé* (resto pagado), *absente*, anular (con aviso por correo), reenviar correos (código perdido), notas internas.
- **Calendrier**: bloquear un día entero o una franja horaria; muestra festivos, días cerrados y número de citas.
- **Cartes cadeau**: buscar un código y validarlo el día de la cita.
- **Réglages**: horarios por día de la semana (con pausa del mediodía), intervalo entre horarios y pausa entre clientas.

Reglas por defecto: lunes a viernes 09:30–18:30, cerrado fines de semana y festivos franceses, horarios cada 30 min, 15 min de pausa entre clientas, reservas desde mañana hasta 90 días.

## Conectar SumUp

1. En la cuenta SumUp de la empresa: *Développeurs → Clés API*, crear una clave secreta (`sk_…`).
2. Copiar también el **code marchand** (perfil de la cuenta).
3. En `.env`: `SUMUP_API_KEY=` y `SUMUP_MERCHANT_CODE=`.
4. `PUBLIC_URL` debe ser la dirección pública en `https://` para que SumUp pueda avisar al servidor y devolver a la clienta.

## Correo

Rellenar `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` y `COMPANY_EMAIL` (el buzón que recibe los avisos).
Sirve cualquier proveedor SMTP (el del dominio, Brevo, Gmail con contraseña de aplicación…).

## Docker

```bash
docker compose up -d --build      # local o demo → http://localhost:5500
```

La base de datos y los correos de prueba viven en el volumen `nyanga-data` (`/app/data` dentro del contenedor).
El contenedor expone `/health` para la comprobación de salud.

### Producción en un VPS (HTTPS automático)

1. Instalar Docker en el VPS y copiar el proyecto (o `git clone`).
2. Apuntar el dominio (registro DNS A) a la IP del VPS.
3. Crear `.env` con `PUBLIC_URL=https://dominio`, `DOMAIN=dominio` y el resto de valores.
4. `docker compose -f deploy/docker-compose.vps.yml up -d --build`

Caddy obtiene el certificado HTTPS solo. Para actualizar: `git pull` y repetir el paso 4.

Copia de seguridad de la base de datos:

```bash
docker compose -f deploy/docker-compose.vps.yml exec web node -e "new (require('node:sqlite').DatabaseSync)('/app/data/nyanga.db').exec(\"VACUUM INTO '/app/data/backup.db'\")"
```

### Plataformas que construyen el Dockerfile desde GitHub

Render, Railway, Fly.io o Coolify detectan el `Dockerfile`. Hay que añadir un **disco/volumen montado en `/app/data`** y las variables del `.env` en su panel.

## Demo para la clienta (GitHub Pages)

`docs/` es una copia de la web que funciona **sin servidor**: las reservas se simulan en el navegador,
no hay pagos ni correos reales y aparece una franja «Démo». Sirve para que la clienta vea y opine sobre el diseño.

1. Subir esta carpeta (`nyanga-web`) a un repositorio de GitHub. Para usar Pages gratis, el repositorio debe ser **público**.
2. En GitHub: *Settings → Pages → Build and deployment → Deploy from a branch* → rama `main`, carpeta **`/docs`** → *Save*.
3. En 1–2 minutos la demo está en `https://<usuario>.github.io/<repositorio>/`.

Si Pages quedó publicando la raíz (`/ (root)`), también funciona: el `index.html` de la raíz redirige a `docs/`.

Después de cambiar algo en `public/`, regenerar la demo antes de subir:

```bash
npm run build:demo     # regenera docs/
npm run demo           # la regenera y la abre en http://localhost:5600/nyanga-web/
```

La página lleva `noindex` para que Google no la indexe antes del lanzamiento.

## Estructura

```
public/          sitio (HTML, CSS, JS) y public/img (fotos y logo optimizados)
docs/            demo estática para GitHub Pages (generada, no editar a mano)
demo/            API simulada y estilo de la franja de la demo
scripts/         build-demo.js (genera docs/) y serve-demo.js (vista previa)
admin/           panel de la empresa
server/
  index.js       servidor Express y cabeceras de seguridad
  catalog.js     soins y precios (fuente única)
  calendar.js    festivos, hora de París y cálculo de horarios
  bookings.js    reservas, pagos, cartas regalo, acciones del panel
  sumup.js       API de SumUp (y modo simulado)
  mailer.js      correos FR/EN
  auth.js        sesión del panel
  routes/        rutas públicas y del panel
test/            pruebas (node --test)
```
