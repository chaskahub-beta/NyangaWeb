<?php
declare(strict_types=1);

/*
  Catálogo de soins. Se guarda en la base (tabla services) y la empresa lo edita
  en el panel (/admin → Soins). La primera vez se llena con catalog.json.
  Las categorías son fijas (catalog.json). El servidor recalcula siempre los precios.

  price       → precio en euros
  duration    → duración mostrada a la clienta (null = no se muestra)
  slotMinutes → tiempo que se bloquea en la agenda
*/
final class Catalog
{
    private static ?Db $db = null;
    private static ?array $cache = null;

    public static function useDb(Db $db): void
    {
        self::$db = $db;
        self::$cache = null;
    }

    /** Categorías fijas: massages, headspa, soins */
    public static function categories(): array
    {
        $json = json_decode((string) file_get_contents(NYANGA_APP . '/catalog.json'), true, 32, JSON_THROW_ON_ERROR);
        return $json['categories'];
    }

    public static function categoryIds(): array
    {
        return array_map(fn($c) => $c['id'], self::categories());
    }

    /** Fila de la base → formato que usan el sitio y las reservas */
    public static function fromRow(array $r): array
    {
        $s = [
            'id' => $r['id'],
            'cat' => $r['cat'],
            'price' => ((int) $r['price_cents']) / 100,
            'priceFrom' => (bool) (int) ($r['price_from'] ?? 0),   // « à partir de »
            'duration' => $r['duration'] === null ? null : (int) $r['duration'],
            'slotMinutes' => (int) $r['slot_minutes'],
            'name' => ['fr' => $r['name_fr'], 'en' => $r['name_en'] ?: $r['name_fr']],
            'desc' => ['fr' => (string) $r['desc_fr'], 'en' => $r['desc_en'] ?: (string) $r['desc_fr']],
        ];
        if ($r['sub_fr']) $s['sub'] = ['fr' => $r['sub_fr'], 'en' => $r['sub_en'] ?: $r['sub_fr']];
        return $s;
    }

    /** Soins visibles en el sitio, en el orden elegido por la empresa (por categoría). */
    public static function data(): array
    {
        if (self::$cache !== null) return self::$cache;
        if (!self::$db) throw new RuntimeException('catalog_without_db');
        $order = array_flip(self::categoryIds());
        $rows = self::$db->all('SELECT * FROM services WHERE active = 1 ORDER BY sort_order, name_fr');
        usort($rows, fn($a, $b) => [($order[$a['cat']] ?? 99), (int) $a['sort_order']] <=> [($order[$b['cat']] ?? 99), (int) $b['sort_order']]);
        return self::$cache = ['categories' => self::categories(), 'services' => array_map([self::class, 'fromRow'], $rows)];
    }

    public static function get(string $id): ?array
    {
        foreach (self::data()['services'] as $s) if ($s['id'] === $id) return $s;
        return null;
    }

    /** Valida una lista de ids y devuelve los soins con totales en céntimos. */
    public static function priceSelection($ids): array
    {
        if (!is_array($ids) || count($ids) === 0) throw new AppError('services_required');
        if (count($ids) > 6) throw new AppError('too_many_services');
        foreach ($ids as $id) if (!is_string($id)) throw new AppError('unknown_service');
        if (count(array_unique($ids)) !== count($ids)) throw new AppError('duplicate_services');
        $items = [];
        foreach ($ids as $id) {
            $s = self::get($id);
            if (!$s) throw new AppError('unknown_service');
            $items[] = $s;
        }
        $total = 0; $minutes = 0;
        foreach ($items as $s) { $total += (int) round($s['price'] * 100); $minutes += (int) $s['slotMinutes']; }
        return ['items' => $items, 'totalCents' => $total, 'minutes' => $minutes];
    }
}
