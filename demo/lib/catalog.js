"use strict";

/*
  Catálogo para la demo: mismos datos que nyanga-app/catalog.json
  (build-demo.mjs los inyecta en CATALOG_DATA) y misma validación que Catalog.php.
*/

const { categories } = CATALOG_DATA;
const services = CATALOG_DATA.services.filter((s) => s.active !== false);
const byId = new Map(services.map((s) => [s.id, s]));

function getService(id) {
  return byId.get(id) || null;
}

function priceSelection(ids) {
  if (!Array.isArray(ids) || ids.length === 0) throw new Error("services_required");
  if (ids.length > 6) throw new Error("too_many_services");
  const unique = [...new Set(ids)];
  if (unique.length !== ids.length) throw new Error("duplicate_services");
  const items = unique.map((id) => {
    const s = getService(id);
    if (!s) throw new Error("unknown_service");
    return s;
  });
  const totalCents = items.reduce((sum, s) => sum + Math.round(s.price * 100), 0);
  const minutes = items.reduce((sum, s) => sum + s.slotMinutes, 0);
  return { items, totalCents, minutes };
}

module.exports = { categories, services, getService, priceSelection };
