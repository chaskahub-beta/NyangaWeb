<?php
declare(strict_types=1);

/*
  Pagos con SumUp (Hosted Checkout).
  - createCheckout: cobro por el importe exacto del acompte → enlace de pago.
  - getCheckout: estado real del cobro (nunca nos fiamos solo del aviso).
  Sin clave → modo simulado: el enlace lleva a /paiement-demo.html y el estado se guarda en mock_checkouts.
*/
final class SumUp
{
    private array $config;
    private Db $db;

    public function __construct(array $config, Db $db)
    {
        $this->config = $config;
        $this->db = $db;
    }

    public function mode(): string { return $this->config['payments_mode']; }

    private function api(string $method, string $path, ?array $body = null): array
    {
        $ch = curl_init($this->config['sumup']['api_base'] . $path);
        $headers = ['Authorization: Bearer ' . $this->config['sumup']['api_key'], 'Accept: application/json'];
        if ($body !== null) {
            $headers[] = 'Content-Type: application/json';
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
        }
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 15,
        ]);
        $text = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($text === false) throw new RuntimeException('sumup_network: ' . $err);
        $data = json_decode((string) $text, true);
        if ($status < 200 || $status >= 300) throw new RuntimeException('sumup_error ' . $status . ': ' . substr((string) $text, 0, 300));
        return is_array($data) ? $data : [];
    }

    /** @return array{id:string,url:string} */
    public function createCheckout(array $b, string $reference, string $description): array
    {
        $amount = $b['deposit_cents'] / 100;
        $base = $this->config['public_url'];
        $q = '?reservation=' . rawurlencode($b['id']) . '&t=' . rawurlencode($b['token']);

        if ($this->mode() === 'mock') {
            $id = 'mock_' . $reference;
            $this->db->run('INSERT INTO mock_checkouts (id, status, amount, reference) VALUES (?,?,?,?)', [$id, 'PENDING', $amount, $reference]);
            return ['id' => $id, 'url' => $base . '/paiement-demo.html' . $q];
        }

        $data = $this->api('POST', '/v0.1/checkouts', [
            'checkout_reference' => $reference,
            'amount' => $amount,
            'currency' => 'EUR',
            'merchant_code' => $this->config['sumup']['merchant_code'],
            'description' => $description,
            'return_url' => $base . '/api/payments/sumup/webhook',
            'redirect_url' => $base . '/' . $q,
            'hosted_checkout' => ['enabled' => true],
        ]);
        if (empty($data['id']) || empty($data['hosted_checkout_url'])) throw new RuntimeException('sumup_no_hosted_url');
        return ['id' => (string) $data['id'], 'url' => (string) $data['hosted_checkout_url']];
    }

    /** @return array{status:string,amount?:float,currency?:string} */
    public function getCheckout(string $id): array
    {
        if ($this->mode() === 'mock') {
            $c = $this->db->one('SELECT status, amount FROM mock_checkouts WHERE id = ?', [$id]);
            return $c ? ['status' => $c['status'], 'amount' => (float) $c['amount'], 'currency' => 'EUR'] : ['status' => 'EXPIRED'];
        }
        $d = $this->api('GET', '/v0.1/checkouts/' . rawurlencode($id));
        return ['status' => strtoupper((string) ($d['status'] ?? '')), 'amount' => (float) ($d['amount'] ?? 0), 'currency' => $d['currency'] ?? null];
    }

    public function mockSetStatus(string $id, string $status): void
    {
        if ($this->mode() !== 'mock') throw new AppError('not_found', 404);
        $this->db->run('UPDATE mock_checkouts SET status = ? WHERE id = ?', [$status, $id]);
    }
}
