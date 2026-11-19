<?php
declare(strict_types=1);

/*
  Gestión de los soins desde el panel: crear, editar, ocultar, borrar y ordenar.
  Las reservas ya hechas guardan su propia copia del nombre y del precio,
  así que cambiar o borrar un soin no altera las reservas existentes.
*/
final class ServicesAdmin
{
    private Db $db;

    public function __construct(Db $db) { $this->db = $db; }

    private static function view(array $r): array
    {
        return [
            'id' => $r['id'],
            'cat' => $r['cat'],
            'sort_order' => (int) $r['sort_order'],
            'price' => ((int) $r['price_cents']) / 100,
            'price_from' => (bool) (int) $r['price_from'],
            'duration' => $r['duration'] === null ? null : (int) $r['duration'],
            'slot_minutes' => (int) $r['slot_minutes'],
            'name_fr' => $r['name_fr'], 'name_en' => (string) $r['name_en'],
            'sub_fr' => (string) $r['sub_fr'], 'sub_en' => (string) $r['sub_en'],
            'desc_fr' => (string) $r['desc_fr'], 'desc_en' => (string) $r['desc_en'],
            'active' => (bool) (int) $r['active'],
        ];
    }

    public function list(): array
    {
        $order = array_flip(Catalog::categoryIds());
        $rows = $this->db->all('SELECT * FROM services ORDER BY sort_order, name_fr');
        usort($rows, fn($a, $b) => [($order[$a['cat']] ?? 99), (int) $a['sort_order']] <=> [($order[$b['cat']] ?? 99), (int) $b['sort_order']]);
        return ['categories' => Catalog::categories(), 'services' => array_map([self::class, 'view'], $rows)];
    }

    private function find(string $id): array
    {
        $r = $this->db->one('SELECT * FROM services WHERE id = ?', [$id]);
        if (!$r) throw new AppError('not_found', 404);
        return $r;
    }

    private static function text($v, int $max): string
    {
        if (!is_string($v)) return '';
        $v = trim(preg_replace('/[\x00-\x1f\x7f]/u', ' ', $v) ?? '');
        return mb_substr($v, 0, $max, 'UTF-8');
    }

    /** Valida los datos del formulario. Devuelve las columnas listas para la base. */
    private function validate(array $in): array
    {
        $fields = [];
        $cat = $in['cat'] ?? '';
        if (!in_array($cat, Catalog::categoryIds(), true)) $fields[] = 'cat';

        $nameFr = self::text($in['name_fr'] ?? null, 80);
        if (mb_strlen($nameFr) < 2) $fields[] = 'name_fr';

        $price = $in['price'] ?? null;
        if (is_string($price)) $price = str_replace(',', '.', trim($price));
        if (!is_numeric($price) || $price < 0 || $price > 2000) $fields[] = 'price';
        $priceCents = is_numeric($price) ? (int) round(((float) $price) * 100) : 0;

        // Duración mostrada (vacía = no se muestra) y tiempo bloqueado en la agenda
        $duration = $in['duration'] ?? null;
        if ($duration === '' || $duration === null) $duration = null;
        elseif (!is_numeric($duration) || (int) $duration != $duration || $duration < 5 || $duration > 600) $fields[] = 'duration';
        else $duration = (int) $duration;

        $slot = $in['slot_minutes'] ?? null;
        if (($slot === '' || $slot === null) && is_int($duration)) $slot = $duration;
        if (!is_numeric($slot) || (int) $slot != $slot || $slot < 15 || $slot > 600) $fields[] = 'slot_minutes';

        if ($fields) throw new AppError('invalid_fields', 400, ['fields' => $fields]);

        $opt = fn($k, $max) => ($t = self::text($in[$k] ?? null, $max)) === '' ? null : $t;
        return [
            'cat' => $cat,
            'price_cents' => $priceCents,
            'duration' => $duration,
            'slot_minutes' => (int) $slot,
            'name_fr' => $nameFr,
            'name_en' => $opt('name_en', 80),
            'sub_fr' => $opt('sub_fr', 80),
            'sub_en' => $opt('sub_en', 80),
            'desc_fr' => $opt('desc_fr', 1500),
            'desc_en' => $opt('desc_en', 1500),
            'price_from' => (($in['price_from'] ?? false) === true || ($in['price_from'] ?? '') === '1') ? 1 : 0,
            'active' => array_key_exists('active', $in) ? (($in['active'] === true || $in['active'] === 1 || $in['active'] === '1') ? 1 : 0) : 1,
        ];
    }

    /** Identificador a partir del nombre: "Massage aux pierres" → massage-aux-pierres */
    private function newId(string $name): string
    {
        $s = $name;
        if (function_exists('iconv')) $s = (string) @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $s);
        $s = strtolower(trim(preg_replace('/[^A-Za-z0-9]+/', '-', $s) ?? '', '-'));
        $s = substr($s !== '' ? $s : 'soin', 0, 32);
        $id = $s; $n = 2;
        while ($this->db->one('SELECT id FROM services WHERE id = ?', [$id])) $id = $s . '-' . $n++;
        return $id;
    }

    public function create(array $in): array
    {
        $v = $this->validate($in);
        $id = $this->newId($v['name_fr']);
        $max = $this->db->one('SELECT COALESCE(MAX(sort_order), 0) AS m FROM services WHERE cat = ?', [$v['cat']]);
        $this->db->run('INSERT INTO services (id, cat, sort_order, price_cents, price_from, duration, slot_minutes, name_fr, name_en, sub_fr, sub_en, desc_fr, desc_en, active, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [
            $id, $v['cat'], (int) $max['m'] + 10, $v['price_cents'], $v['price_from'], $v['duration'], $v['slot_minutes'],
            $v['name_fr'], $v['name_en'], $v['sub_fr'], $v['sub_en'], $v['desc_fr'], $v['desc_en'], $v['active'], Clock::iso(),
        ]);
        return self::view($this->find($id));
    }

    public function update(string $id, array $in): array
    {
        $old = $this->find($id);
        $v = $this->validate($in);
        $sort = (int) $old['sort_order'];
        if ($v['cat'] !== $old['cat']) {
            // Cambio de categoría: va al final de la nueva
            $max = $this->db->one('SELECT COALESCE(MAX(sort_order), 0) AS m FROM services WHERE cat = ?', [$v['cat']]);
            $sort = (int) $max['m'] + 10;
        }
        $this->db->run('UPDATE services SET cat = ?, sort_order = ?, price_cents = ?, price_from = ?, duration = ?, slot_minutes = ?, name_fr = ?, name_en = ?,
            sub_fr = ?, sub_en = ?, desc_fr = ?, desc_en = ?, active = ?, updated_at = ? WHERE id = ?', [
            $v['cat'], $sort, $v['price_cents'], $v['price_from'], $v['duration'], $v['slot_minutes'], $v['name_fr'], $v['name_en'],
            $v['sub_fr'], $v['sub_en'], $v['desc_fr'], $v['desc_en'], $v['active'], Clock::iso(), $id,
        ]);
        return self::view($this->find($id));
    }

    public function delete(string $id): void
    {
        $this->find($id);
        $this->db->run('DELETE FROM services WHERE id = ?', [$id]);
    }

    /** Nuevo orden: lista completa de ids en el orden deseado. */
    public function reorder($ids): array
    {
        if (!is_array($ids)) throw new AppError('invalid_order');
        $i = 0;
        foreach ($ids as $id) {
            if (!is_string($id)) throw new AppError('invalid_order');
            $this->db->run('UPDATE services SET sort_order = ? WHERE id = ?', [($i++) * 10, $id]);
        }
        return $this->list();
    }
}
