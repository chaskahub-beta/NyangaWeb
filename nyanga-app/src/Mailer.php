<?php
declare(strict_types=1);

/*
  Correos con el diseño de la "Carte cadeau" de Nyanga (fondo chocolate, título
  CARTE CADEAU, logo, campos blancos redondeados, línea dorada punteada, dirección
  y tres franjas de fotos). HTML para correo: tablas y estilos en línea.
  Con SMTP configurado se envían; si no, se guardan en storage/outbox.
*/
final class Mailer
{
    private const T = [
        'fr' => [
            'hello' => 'Bonjour %s,',
            'confirmedSubject' => 'Votre réservation chez Nyanga Beauty est confirmée',
            'confirmedIntro' => 'Merci, votre paiement a bien été reçu. Votre rendez-vous est confirmé.',
            'giftBuyerSubject' => 'Votre carte cadeau Nyanga Beauty',
            'giftBuyerIntro' => 'Merci, votre paiement a bien été reçu. Voici la carte cadeau offerte à %s : elle lui a aussi été envoyée par e-mail.',
            'giftRecipientSubject' => '%s vous offre un moment chez Nyanga Beauty',
            'giftRecipientIntro' => '%s vous offre un soin chez Nyanga Beauty & Spa.',
            'cancelledSubject' => 'Votre rendez-vous chez Nyanga Beauty est annulé',
            'cancelledIntro' => 'Votre rendez-vous a été annulé. Pour toute question, contactez-nous directement.',
            'titleGift' => ['Carte', 'Cadeau'],
            'titleBooking' => ['Votre', 'rendez-vous'],
            'titleCancelled' => ['Rendez-vous', 'annulé'],
            'welcome' => 'Nous avons le plaisir de vous recevoir pour un moment de détente et de bien-être.',
            'from' => 'De la part de',
            'for' => 'Pour',
            'treatment' => 'Soin',
            'value' => "D'une valeur de",
            'when' => 'Le',
            'code' => 'Code',
            'giftNote' => 'Non remboursable · valable uniquement à la date du rendez-vous',
            'bookingNote' => "L'acompte de 20 % n'est pas remboursable",
            'paidNote' => 'Réglé en totalité · rien à payer sur place',
            'date' => 'Date',
            'total' => 'Total des soins',
            'deposit' => 'Acompte payé (non remboursable)',
            'paidFull' => 'Payé en totalité',
            'rest' => 'Reste à régler sur place',
            'nothingLeft' => 'Rien à régler sur place',
            'restPending' => 'Reste à régler sur place le jour du soin',
            'lost' => 'En cas de perte du code, contactez directement Nyanga Beauty.',
            'bring' => 'Présentez ce code le jour du rendez-vous.',
            'signoff' => 'À très bientôt,<br>Nyanga Beauty & Spa',
            'addCalendar' => 'Ajouter à mon agenda',
            'calendarApple' => 'iPhone · Outlook · Android',
            'calendarGoogle' => 'Google Agenda',
            'calendarHint' => 'Le rendez-vous est aussi en pièce jointe (.ics), avec un rappel la veille et 2 h avant.',
            'shareTitle' => 'Envoyer la carte à %s',
            'shareIntro' => 'Un message prêt à envoyer, avec toutes les informations de sa carte cadeau :',
            'shareWhatsapp' => 'WhatsApp',
            'shareSms' => 'SMS',
            'shareEmail' => 'E-mail',
            'shareSubject' => 'Ta carte cadeau Nyanga Beauty & Spa',
        ],
        'en' => [
            'hello' => 'Hello %s,',
            'confirmedSubject' => 'Your Nyanga Beauty booking is confirmed',
            'confirmedIntro' => 'Thank you, your payment has been received. Your appointment is confirmed.',
            'giftBuyerSubject' => 'Your Nyanga Beauty gift card',
            'giftBuyerIntro' => 'Thank you, your payment has been received. Here is the gift card for %s: it has also been emailed to them.',
            'giftRecipientSubject' => '%s is treating you to Nyanga Beauty',
            'giftRecipientIntro' => '%s is giving you a treatment at Nyanga Beauty & Spa.',
            'cancelledSubject' => 'Your Nyanga Beauty appointment is cancelled',
            'cancelledIntro' => 'Your appointment has been cancelled. For any question, please contact us directly.',
            'titleGift' => ['Gift', 'Card'],
            'titleBooking' => ['Your', 'appointment'],
            'titleCancelled' => ['Appointment', 'cancelled'],
            'welcome' => 'We are delighted to welcome you for a moment of relaxation and well-being.',
            'from' => 'From',
            'for' => 'For',
            'treatment' => 'Treatment',
            'value' => 'Worth',
            'when' => 'On',
            'code' => 'Code',
            'giftNote' => 'Non-refundable · valid only on the appointment date',
            'bookingNote' => 'The 20% deposit is non-refundable',
            'paidNote' => 'Paid in full · nothing to pay on site',
            'date' => 'Date',
            'total' => 'Treatments total',
            'deposit' => 'Deposit paid (non-refundable)',
            'paidFull' => 'Paid in full',
            'rest' => 'Left to pay on site',
            'nothingLeft' => 'Nothing left to pay on site',
            'restPending' => 'Left to pay on site on the day',
            'lost' => 'If the code is lost, please contact Nyanga Beauty directly.',
            'bring' => 'Show this code on the day of the appointment.',
            'signoff' => 'See you soon,<br>Nyanga Beauty & Spa',
            'addCalendar' => 'Add to my calendar',
            'calendarApple' => 'iPhone · Outlook · Android',
            'calendarGoogle' => 'Google Calendar',
            'calendarHint' => 'The appointment is also attached (.ics), with a reminder the day before and 2 h before.',
            'shareTitle' => 'Send the card to %s',
            'shareIntro' => 'A ready-to-send message with all the details of their gift card:',
            'shareWhatsapp' => 'WhatsApp',
            'shareSms' => 'Text message',
            'shareEmail' => 'Email',
            'shareSubject' => 'Your Nyanga Beauty & Spa gift card',
        ],
    ];

    private const DAYS = [
        'fr' => ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'],
        'en' => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    ];
    private const MONTHS = [
        'fr' => ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
        'en' => ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    ];

    // Paleta de la carte cadeau
    private const CHOCO = '#3E1A12';
    private const CREAM = '#F6EFE6';
    private const PAPER = '#FBF7F2';
    private const GOLD = '#C9A24A';
    private const GOLD_SOFT = '#E3C98D';
    private const INK_SOFT = '#6B4A3F';

    private array $config;

    public function __construct(array $config)
    {
        $this->config = $config;
    }

    public static function esc($s): string
    {
        return htmlspecialchars((string) ($s ?? ''), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    }

    /** "lundi 16 novembre 2026" / "Monday 16 November 2026" */
    public static function longDate(string $key, string $lang): string
    {
        $lang = $lang === 'en' ? 'en' : 'fr';
        [$y, $m, $d] = array_map('intval', explode('-', $key));
        return self::DAYS[$lang][Calendar::weekday($key)] . ' ' . $d . ' ' . self::MONTHS[$lang][$m - 1] . ' ' . $y;
    }

    private static function paidFull(array $b): bool { return !empty($b['pay_full']); }

    private static function serviceNames(array $b, string $lang): string
    {
        return implode(' + ', array_map(fn($s) => $s['name'][$lang] ?? $s['name']['fr'], json_decode($b['services_json'], true)));
    }

    private function img(string $path): string
    {
        return self::esc($this->config['public_url'] . '/img/mail/' . $path);
    }

    /* ---------------- Piezas del diseño ---------------- */

    /** Campo blanco redondeado: "De la part de : Camille" */
    private static function pill(string $label, string $valueHtml): string
    {
        return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px"><tr>
<td style="background:' . self::PAPER . ';border-radius:999px;padding:8px 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.35;color:' . self::CHOCO . '">
<span style="color:' . self::INK_SOFT . '">' . $label . ' :</span> <strong>' . $valueHtml . '</strong></td></tr></table>';
    }

    /**
     * La tarjeta marrón de la carte cadeau.
     * @param string[] $title dos líneas, ej. ['Carte', 'Cadeau']
     * @param string $pills HTML de los campos
     */
    private function card(array $title, string $intro, string $pills, string $note): string
    {
        $titleHtml = self::esc(mb_strtoupper($title[0], 'UTF-8')) . '<br>' . self::esc(mb_strtoupper($title[1], 'UTF-8'));
        $address = self::esc($this->config['business_address']);
        $phone = (string) ($this->config['business_phone'] ?? '');
        if ($phone !== '') {
            $tel = '+33' . substr(preg_replace('/\D/', '', $phone), 1);
            $address .= ' · <a href="tel:' . self::esc($tel) . '" style="color:' . self::CREAM . ';text-decoration:none">' . self::esc($phone) . '</a>';
        }
        $strips = '';
        foreach (['strip-1.jpg', 'strip-2.jpg', 'strip-3.jpg'] as $i => $s) {
            $strips .= '<td width="48" style="padding-left:' . ($i ? 6 : 0) . 'px"><img src="' . $this->img($s) . '" width="48" height="280" alt="" style="display:block;border:0;width:48px;height:280px;border-radius:2px"></td>';
        }
        return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' . self::CHOCO . ';border-radius:14px">
<tr>
<td valign="top" style="padding:26px 20px 22px 26px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td valign="middle" style="font-family:\'Cormorant Garamond\',Georgia,\'Times New Roman\',serif;font-size:34px;line-height:1;letter-spacing:1px;color:' . self::CREAM . '">' . $titleHtml . '</td>
    <td valign="middle" align="right" style="padding-left:10px"><img src="' . $this->img('logo-cream.png') . '" width="150" alt="Nyanga Beauty &amp; Spa" style="display:block;border:0;width:150px;max-width:100%;height:auto"></td>
  </tr></table>
  <p style="margin:18px 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.45;color:' . self::CREAM . '">' . $intro . '</p>
  ' . $pills . '
  <p style="margin:12px 0 10px 4px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:' . self::GOLD_SOFT . '">' . $note . '</p>
  <div style="border-top:2px dotted ' . self::GOLD . ';margin:0 0 12px;font-size:0;line-height:0">&nbsp;</div>
  <p style="margin:0;font-family:Georgia,\'Times New Roman\',serif;font-size:13px;line-height:1.4;color:' . self::CREAM . '">' . $address . '</p>
</td>
<td class="strips" valign="top" width="156" style="padding:14px 14px 14px 0">
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>' . $strips . '</tr></table>
</td>
</tr></table>';
    }

    private static function layout(string $inner, string $preheader = ''): string
    {
        return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500&display=swap" rel="stylesheet">
<style>@media (max-width:520px){.strips{display:none!important}}</style></head>
<body style="margin:0;padding:0;background:#EFE6DA">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">' . self::esc($preheader) . '</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EFE6DA"><tr><td align="center" style="padding:24px 10px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px">
<tr><td>' . $inner . '</td></tr>
</table></td></tr></table></body></html>';
    }

    /** Bloque claro bajo la tarjeta (saludo, detalles, botones). */
    private static function panel(string $html): string
    {
        return '<div style="background:' . self::PAPER . ';border:1px solid #E3D3BF;border-radius:14px;margin-top:14px;padding:22px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#2E140E">' . $html . '</div>';
    }

    private static function row(string $label, string $value, bool $strong = false): string
    {
        $w = $strong ? 'font-weight:bold;' : '';
        return '<tr><td style="padding:7px 0;border-bottom:1px solid #EADBC8;color:' . self::INK_SOFT . ';' . $w . '">' . $label . '</td><td style="padding:7px 0;border-bottom:1px solid #EADBC8;text-align:right;' . $w . '">' . $value . '</td></tr>';
    }

    private static function detailsTable(array $b, string $lang): string
    {
        $t = self::T[$lang];
        $rows = self::row($t['date'], self::esc(self::longDate($b['date'], $lang)) . ' · ' . self::esc($b['start']));
        foreach (json_decode($b['services_json'], true) as $s) {
            $rows .= self::row(self::esc($s['name'][$lang] ?? $s['name']['fr']), Ics::eur((int) $s['priceCents'], $lang));
        }
        $rows .= self::row($t['total'], Ics::eur((int) $b['total_cents'], $lang), true);
        $rest = (int) $b['total_cents'] - (int) $b['deposit_cents'];
        if (self::paidFull($b)) {
            $rows .= self::row($t['paidFull'], Ics::eur((int) $b['deposit_cents'], $lang));
            $rows .= self::row($t['nothingLeft'], '✓');
        } else {
            $rows .= self::row($t['deposit'], Ics::eur((int) $b['deposit_cents'], $lang));
            $rows .= self::row($t['rest'], Ics::eur($rest, $lang));
        }
        return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:12px 0;font-size:14px">' . $rows . '</table>';
    }

    private static function btn(string $href, string $label): string
    {
        return '<a href="' . self::esc($href) . '" style="display:inline-block;margin:4px 6px 4px 0;padding:10px 18px;border-radius:999px;background:' . self::CHOCO . ';color:' . self::CREAM . ';text-decoration:none;font-size:14px">' . $label . '</a>';
    }

    private function calendarBlock(array $b, string $lang): string
    {
        $t = self::T[$lang];
        $links = Ics::links($b, $this->config['public_url'], $this->config['business_address'], $lang);
        return '<div style="margin:18px 0 6px"><div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:' . self::INK_SOFT . ';margin-bottom:6px">' . $t['addCalendar'] . '</div>
' . self::btn($links['ics'], $t['calendarApple']) . self::btn($links['google'], $t['calendarGoogle']) . '
<div style="font-size:12px;color:' . self::INK_SOFT . ';margin-top:6px">' . $t['calendarHint'] . '</div></div>';
    }

    /** Campos de la carte cadeau (comprador y beneficiario ven la misma tarjeta). */
    private function giftCard(array $b, string $lang): string
    {
        $t = self::T[$lang];
        $pills = self::pill($t['from'], self::esc($b['client_name']))
            . self::pill($t['for'], self::esc($b['gift_name']))
            . self::pill($t['treatment'], self::esc(self::serviceNames($b, $lang)))
            . self::pill($t['value'], Ics::eur((int) $b['total_cents'], $lang))
            . self::pill($t['when'], self::esc(self::longDate($b['date'], $lang)) . ' · ' . self::esc($b['start']))
            . self::pill($t['code'], '<span style="letter-spacing:2px">' . self::esc($b['gift_code']) . '</span>');
        // Carte cadeau con acompte del 20 %: se indica claramente lo que queda por pagar
        $rest = (int) $b['total_cents'] - (int) $b['deposit_cents'];
        if (!self::paidFull($b) && $rest > 0) {
            $pills .= self::pill($t['restPending'], Ics::eur($rest, $lang));
        }
        $note = $t['giftNote'] . (self::paidFull($b) ? ' · ' . $t['paidNote'] : '');
        return $this->card($t['titleGift'], self::esc($t['welcome']), $pills, self::esc($note));
    }

    /**
     * Mensaje que la compradora puede enviar al beneficiario (mismo texto que en la web).
     */
    public static function shareText(array $b, string $lang): string
    {
        $names = self::serviceNames($b, $lang);
        $when = self::longDate($b['date'], $lang);
        $rest = (int) $b['total_cents'] - (int) $b['deposit_cents'];
        if ($lang === 'en') {
            $lines = [
                'Hello ' . $b['gift_name'] . '!',
                'I\'m treating you to "' . $names . '" at Nyanga Beauty & Spa (Granges-Narboz) 🎁',
                'Your appointment: ' . $when . ' at ' . $b['start'] . '.',
                'Your gift card code: ' . $b['gift_code'] . ' (show it on the day).',
                $rest > 0 ? 'The remaining ' . Ics::eur($rest, 'en') . ' is paid on site.' : 'Everything is already paid, enjoy!',
            ];
        } else {
            $lines = [
                'Bonjour ' . $b['gift_name'] . ' !',
                'Je t\'offre « ' . $names . ' » chez Nyanga Beauty & Spa (Granges-Narboz) 🎁',
                'Ton rendez-vous : le ' . $when . ' à ' . $b['start'] . '.',
                'Ton code carte cadeau : ' . $b['gift_code'] . ' (à présenter le jour J).',
                $rest > 0 ? 'Le reste, ' . Ics::eur($rest, 'fr') . ', se règle sur place.' : 'Tout est déjà réglé, profite bien !',
            ];
        }
        if (!empty($b['gift_message'])) $lines[] = '« ' . $b['gift_message'] . ' »';
        $lines[] = '— ' . $b['client_name'];
        return implode("\n", $lines);
    }

    private function shareBlock(array $b, string $lang): string
    {
        $t = self::T[$lang];
        $text = self::shareText($b, $lang);
        $enc = rawurlencode($text);
        $mail = 'mailto:' . rawurlencode((string) $b['gift_email']) . '?subject=' . rawurlencode($t['shareSubject']) . '&body=' . $enc;
        return '<div style="margin:20px 0 4px;padding:16px;border:1px dashed ' . self::GOLD . ';border-radius:12px;background:#FFFDF9">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:' . self::INK_SOFT . ';margin-bottom:6px">' . self::esc(sprintf($t['shareTitle'], $b['gift_name'])) . '</div>
<p style="margin:0 0 8px;font-size:13px;color:' . self::INK_SOFT . '">' . $t['shareIntro'] . '</p>
<div style="white-space:pre-line;font-size:14px;line-height:1.5;background:#fff;border-radius:8px;padding:12px;border:1px solid #EADBC8">' . self::esc($text) . '</div>
<div style="margin-top:10px">' . self::btn('https://wa.me/?text=' . $enc, $t['shareWhatsapp']) . self::btn('sms:?&body=' . $enc, $t['shareSms']) . self::btn($mail, $t['shareEmail']) . '</div>
</div>';
    }

    private function icsAttachment(array $b, string $lang, string $audience = 'client', bool $cancel = false): array
    {
        return [
            'filename' => 'nyanga-rendez-vous.ics',
            'type' => 'text/calendar; charset=utf-8; method=' . ($cancel ? 'CANCEL' : 'PUBLISH'),
            'content' => Ics::build($b, $lang, $this->config['business_address'], $audience, $cancel),
        ];
    }

    /* ---------------- Correos ---------------- */

    /** Correos de una reserva confirmada (clienta o comprador + beneficiario, y la empresa). */
    public function confirmationEmails(array $b): array
    {
        $lang = $b['lang'] === 'en' ? 'en' : 'fr';
        $t = self::T[$lang];
        $cal = $this->calendarBlock($b, $lang);
        $ics = $this->icsAttachment($b, $lang);
        $mails = [];

        if ($b['mode'] === 'gift') {
            $card = $this->giftCard($b, $lang);
            $mails[] = [
                'to' => $b['client_email'],
                'subject' => $t['giftBuyerSubject'],
                'html' => self::layout($card . self::panel(
                    '<p style="margin-top:0">' . sprintf($t['hello'], self::esc($b['client_name'])) . '</p><p>' . sprintf($t['giftBuyerIntro'], self::esc($b['gift_name'])) . '</p>'
                    . self::detailsTable($b, $lang) . $this->shareBlock($b, $lang)
                    . '<p style="font-size:13px;color:' . self::INK_SOFT . '">' . $t['lost'] . '</p><p style="margin-bottom:0">' . $t['signoff'] . '</p>'
                ), $t['giftBuyerSubject']),
            ];
            $msg = $b['gift_message'] ? '<p style="font-family:Georgia,serif;font-style:italic;font-size:16px;border-left:3px solid ' . self::GOLD . ';padding-left:12px;margin:14px 0">' . self::esc($b['gift_message']) . '</p>' : '';
            $mails[] = [
                'to' => $b['gift_email'],
                'subject' => sprintf($t['giftRecipientSubject'], $b['client_name']),
                'html' => self::layout($card . self::panel(
                    '<p style="margin-top:0">' . sprintf($t['hello'], self::esc($b['gift_name'])) . '</p><p>' . sprintf($t['giftRecipientIntro'], self::esc($b['client_name'])) . '</p>'
                    . $msg . '<p>' . $t['bring'] . '</p>' . $cal
                    . '<p style="font-size:13px;color:' . self::INK_SOFT . '">' . $t['lost'] . '</p><p style="margin-bottom:0">' . $t['signoff'] . '</p>'
                ), sprintf($t['giftRecipientIntro'], $b['client_name'])),
                'attachments' => [$ics],
            ];
        } else {
            $pills = self::pill($t['for'], self::esc($b['client_name']))
                . self::pill($t['treatment'], self::esc(self::serviceNames($b, $lang)))
                . self::pill($t['when'], self::esc(self::longDate($b['date'], $lang)) . ' · ' . self::esc($b['start']))
                . self::pill($t['value'], Ics::eur((int) $b['total_cents'], $lang));
            $note = self::paidFull($b) ? $t['paidNote'] : $t['bookingNote'];
            $card = $this->card($t['titleBooking'], self::esc($t['welcome']), $pills, self::esc($note));
            $mails[] = [
                'to' => $b['client_email'],
                'subject' => $t['confirmedSubject'],
                'html' => self::layout($card . self::panel(
                    '<p style="margin-top:0">' . sprintf($t['hello'], self::esc($b['client_name'])) . '</p><p>' . $t['confirmedIntro'] . '</p>'
                    . self::detailsTable($b, $lang) . $cal . '<p style="margin-bottom:0">' . $t['signoff'] . '</p>'
                ), $t['confirmedIntro']),
                'attachments' => [$ics],
            ];
        }

        $company = (string) $this->config['mail']['company_email'];
        if ($company !== '') $mails[] = $this->companyNotice($b, $company);
        return $mails;
    }

    /** Aviso a la empresa (siempre en francés), con la misma tarjeta. */
    private function companyNotice(array $b, string $to): array
    {
        $gift = $b['mode'] === 'gift';
        $kind = $gift ? 'Carte cadeau' : 'Réservation';
        $pills = self::pill('Cliente', self::esc($b['client_name']) . ' · ' . self::esc($b['client_phone']))
            . ($gift ? self::pill('Pour', self::esc($b['gift_name']) . ', ' . self::esc($b['gift_age']) . ' ans') : '')
            . self::pill('Soin', self::esc(self::serviceNames($b, 'fr')))
            . self::pill('Le', self::esc(self::longDate($b['date'], 'fr')) . ' · ' . self::esc($b['start']))
            . ($gift ? self::pill('Code', self::esc($b['gift_code'])) : '');
        $paid = self::paidFull($b) ? 'Payé en totalité en ligne' : 'Acompte de 20 % payé en ligne';
        $card = $this->card([$kind === 'Carte cadeau' ? 'Carte' : 'Nouvelle', $kind === 'Carte cadeau' ? 'Cadeau' : 'Réservation'],
            'Nouvelle ' . mb_strtolower($kind, 'UTF-8') . ' confirmée.', $pills, self::esc($paid));
        $attention = (int) $b['needs_attention']
            ? '<p style="margin-top:0;color:#A8553C"><b>À vérifier :</b> le paiement est arrivé après l\'expiration de la réservation et le créneau était peut-être déjà pris.</p>'
            : '';
        $contact = '<p style="margin-top:0"><b>Cliente :</b> ' . self::esc($b['client_name']) . '<br>' . self::esc($b['client_email']) . ' · ' . self::esc($b['client_phone']) . '</p>'
            . ($gift ? '<p><b>Bénéficiaire :</b> ' . self::esc($b['gift_name']) . ', ' . self::esc($b['gift_age']) . ' ans · ' . self::esc($b['gift_email'])
                . ($b['gift_message'] ? '<br><b>Message :</b> ' . self::esc($b['gift_message']) : '') . '</p>' : '');
        return [
            'to' => $to,
            'subject' => $kind . ' · ' . self::longDate($b['date'], 'fr') . ' ' . $b['start'] . ' · ' . $b['client_name'],
            'html' => self::layout($card . self::panel($attention . $contact . self::detailsTable($b, 'fr')
                . '<p style="font-size:12px;color:' . self::INK_SOFT . ';margin-bottom:0">Le rendez-vous est en pièce jointe (.ics) pour l\'ajouter à votre agenda.<br>Réf. ' . self::esc($b['id']) . '</p>')),
            'attachments' => [$this->icsAttachment($b, 'fr', 'company')],
        ];
    }

    /** Anulación: el .ics adjunto (mismo UID, METHOD:CANCEL) quita el evento del calendario. */
    public function cancellationEmails(array $b): array
    {
        $lang = $b['lang'] === 'en' ? 'en' : 'fr';
        $t = self::T[$lang];
        $pills = self::pill($t['treatment'], self::esc(self::serviceNames($b, $lang)))
            . self::pill($t['when'], self::esc(self::longDate($b['date'], $lang)) . ' · ' . self::esc($b['start']));
        $card = $this->card($t['titleCancelled'], self::esc($t['cancelledIntro']), $pills, '');
        $to = $b['mode'] === 'gift' ? [$b['client_email'], $b['gift_email']] : [$b['client_email']];
        return array_map(fn($addr) => [
            'to' => $addr,
            'subject' => $t['cancelledSubject'],
            'html' => self::layout($card . self::panel(self::detailsTable($b, $lang) . '<p style="margin-bottom:0">' . $t['signoff'] . '</p>'), $t['cancelledIntro']),
            'attachments' => [$this->icsAttachment($b, $lang, 'client', true)],
        ], $to);
    }

    public function send(array $mail): void
    {
        if ($this->config['mail_mode'] === 'smtp') {
            Smtp::send($this->config['mail'], $mail);
            return;
        }
        $dir = $this->config['outbox_dir'];
        if (!is_dir($dir)) mkdir($dir, 0775, true);
        $safeTo = preg_replace('/[^a-z0-9@._-]/i', '_', $mail['to']);
        $file = $dir . '/' . (int) (microtime(true) * 1000) . '-' . bin2hex(random_bytes(3)) . '-' . $safeTo . '.html';
        $header = '<!-- To: ' . self::esc($mail['to']) . ' | Subject: ' . self::esc($mail['subject']) . " -->\n";
        file_put_contents($file, $header . $mail['html']);
        foreach ($mail['attachments'] ?? [] as $i => $a) {
            file_put_contents(preg_replace('/\.html$/', '-' . ($i + 1) . '-' . $a['filename'], $file), $a['content']);
        }
    }

    /** Envía todos; si alguno falla lanza mail_failed (después de intentar los demás). */
    public function sendAll(array $mails): void
    {
        $failed = 0;
        foreach ($mails as $m) {
            try { $this->send($m); }
            catch (Throwable $e) { $failed++; error_log('[mail] envoi échoué: ' . $e->getMessage()); }
        }
        if ($failed) throw new RuntimeException('mail_failed');
    }
}
