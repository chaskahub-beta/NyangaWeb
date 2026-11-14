<?php
declare(strict_types=1);

/*
  Cliente SMTP mínimo (sin librerías): SSL (465) o STARTTLS (587), AUTH LOGIN,
  correo HTML en UTF-8 con adjuntos (el .ics del rendez-vous).
*/
final class Smtp
{
    /** @param array{host:string,port:int,user:string,pass:string,from:string} $cfg */
    public static function send(array $cfg, array $mail): void
    {
        $host = (string) $cfg['host'];
        $port = (int) $cfg['port'];
        $remote = ($port === 465 ? 'ssl://' : 'tcp://') . $host . ':' . $port;
        $ssl = ['verify_peer' => true, 'verify_peer_name' => true, 'SNI_enabled' => true];
        // Solo pruebas locales: certificado propio del servidor ficticio. En el hosting no se usa.
        if (!empty($cfg['cafile'])) $ssl['cafile'] = (string) $cfg['cafile'];
        $ctx = stream_context_create(['ssl' => $ssl]);
        $fp = @stream_socket_client($remote, $errno, $errstr, 20, STREAM_CLIENT_CONNECT, $ctx);
        if (!$fp) throw new RuntimeException("smtp_connect: $errstr ($errno)");
        stream_set_timeout($fp, 20);

        try {
            self::expect($fp, [220]);
            $ehlo = 'EHLO ' . (gethostname() ?: 'localhost');
            $caps = self::cmd($fp, $ehlo, [250]);
            $secure = $port === 465;
            if (!$secure && stripos($caps, 'STARTTLS') !== false) {
                self::cmd($fp, 'STARTTLS', [220]);
                if (!stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT | STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT)) {
                    throw new RuntimeException('smtp_starttls');
                }
                self::cmd($fp, $ehlo, [250]);
                $secure = true;
            }
            if ((string) $cfg['user'] !== '') {
                // Nunca se envía la contraseña sin cifrar
                if (!$secure) throw new RuntimeException('smtp_no_tls');
                self::cmd($fp, 'AUTH LOGIN', [334]);
                self::cmd($fp, base64_encode((string) $cfg['user']), [334]);
                self::cmd($fp, base64_encode((string) $cfg['pass']), [235]);
            }
            $fromAddr = self::address((string) $cfg['from']);
            self::cmd($fp, 'MAIL FROM:<' . $fromAddr . '>', [250]);
            self::cmd($fp, 'RCPT TO:<' . self::address($mail['to']) . '>', [250, 251]);
            self::cmd($fp, 'DATA', [354]);
            $data = self::build((string) $cfg['from'], $fromAddr, $mail);
            // Punto al inicio de línea se duplica (RFC 5321)
            $data = preg_replace('/^\./m', '..', $data);
            self::cmd($fp, $data . "\r\n.", [250]);
            @fwrite($fp, "QUIT\r\n");
        } finally {
            fclose($fp);
        }
    }

    private static function address(string $s): string
    {
        if (preg_match('/<([^>]+)>/', $s, $m)) $s = $m[1];
        $s = trim($s);
        if (!filter_var($s, FILTER_VALIDATE_EMAIL)) throw new RuntimeException('smtp_bad_address');
        return $s;
    }

    private static function header(string $s): string
    {
        return preg_match('/[^\x20-\x7E]/', $s) ? '=?UTF-8?B?' . base64_encode($s) . '?=' : $s;
    }

    private static function fromHeader(string $from, string $addr): string
    {
        $name = trim(preg_replace('/<[^>]*>/', '', $from), " \"");
        return $name !== '' ? self::header($name) . ' <' . $addr . '>' : $addr;
    }

    private static function build(string $from, string $fromAddr, array $mail): string
    {
        $domain = substr(strrchr($fromAddr, '@'), 1) ?: 'localhost';
        $boundary = 'nyg_' . bin2hex(random_bytes(12));
        $h = [
            'Date: ' . gmdate('D, d M Y H:i:s') . ' +0000',
            'From: ' . self::fromHeader($from, $fromAddr),
            'To: ' . self::address($mail['to']),
            'Subject: ' . self::header((string) $mail['subject']),
            'Message-ID: <' . bin2hex(random_bytes(12)) . '@' . $domain . '>',
            'MIME-Version: 1.0',
        ];
        $html = chunk_split(base64_encode((string) $mail['html']), 76, "\r\n");
        $att = $mail['attachments'] ?? [];
        if (!$att) {
            $h[] = 'Content-Type: text/html; charset=UTF-8';
            $h[] = 'Content-Transfer-Encoding: base64';
            return implode("\r\n", $h) . "\r\n\r\n" . $html;
        }
        $h[] = 'Content-Type: multipart/mixed; boundary="' . $boundary . '"';
        $body = "--$boundary\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . $html;
        foreach ($att as $a) {
            $name = preg_replace('/[^A-Za-z0-9._-]/', '_', (string) $a['filename']);
            $body .= "--$boundary\r\nContent-Type: {$a['type']}; name=\"$name\"\r\nContent-Disposition: attachment; filename=\"$name\"\r\n"
                . "Content-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode((string) $a['content']), 76, "\r\n");
        }
        $body .= "--$boundary--";
        return implode("\r\n", $h) . "\r\n\r\n" . $body;
    }

    private static function cmd($fp, string $line, array $ok): string
    {
        fwrite($fp, $line . "\r\n");
        return self::expect($fp, $ok);
    }

    private static function expect($fp, array $ok): string
    {
        $resp = '';
        while (($l = fgets($fp, 1024)) !== false) {
            $resp .= $l;
            if (strlen($l) < 4 || $l[3] !== '-') break;
        }
        $code = (int) substr($resp, 0, 3);
        if (!in_array($code, $ok, true)) throw new RuntimeException('smtp_error: ' . trim($resp));
        return $resp;
    }
}
