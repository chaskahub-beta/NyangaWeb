<?php
declare(strict_types=1);

/*
  Catálogo de soins: fuente única en nyanga-app/catalog.json.
  El servidor recalcula siempre los precios con estos datos.
  duration    → duración mostrada (null = no se muestra)
  slotMinutes → tiempo que se bloquea en la agenda
*/
final class Catalog
{
    private static ?array $data = null;

    public static function data(): array
    {
        if (self::$data === null) {
            self::$data = json_decode((string) file_get_contents(NYANGA_APP . '/catalog.json'), true, 32, JSON_THROW_ON_ERROR);
        }
        return self::$data;
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
