/* ============================================================
   Configuración visual del sitio. Los soins, precios y la agenda
   vienen del servidor (/api/catalog y /api/availability).
   ============================================================ */

window.NYANGA = {
  // WhatsApp de la empresa: dudas, cambios, anulaciones, reembolsos, presupuestos
  whatsapp: "33664297767",

  // Historias de la página de inicio (filtran la lista de soins)
  stories: [
    { cat: "massages", fr: "Massages", en: "Massages", img: "img/story-massages.webp" },
    { cat: "headspa", fr: "Head Spa", en: "Head Spa", img: "img/story-headspa.webp" },
    { cat: "soins", fr: "Hammam", en: "Hammam", img: "img/story-hammam.webp" },
    { cat: "soins", fr: "Rituels", en: "Rituals", img: "img/story-rituels.webp" },
    { cat: "soins", fr: "Tresses", en: "Braids", img: "img/story-tresses.webp" },
    { target: "perruques", fr: "Perruques", en: "Wigs", img: "img/story-perruques.webp" }
  ],

  // Soins destacados en la página de inicio
  featured: ["signature", "headspa-voyage", "hammam"],

  // Foto de cada soin destacado
  photos: {
    "signature": "img/post-signature.webp",
    "headspa-voyage": "img/post-headspa.webp",
    "hammam": "img/post-hammam.webp"
  }
};
