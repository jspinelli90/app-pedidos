(function (root, factory) {
  const model = factory();
  if (typeof module === "object" && module.exports) module.exports = model;
  if (root) root.RetailOffersModel = model;
})(typeof window === "undefined" ? null : window, function () {
  const UNITS = { kg: "kg", unit: "unidades", box: "cajas" };
  const fail = message => { throw Object.assign(new Error(message), { statusCode: 400 }); };
  function today(now = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const get = type => parts.find(part => part.type === type).value;
    return `${get("year")}-${get("month")}-${get("day")}`;
  }
  function validDate(value) {
    return value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  }
  function status(offer, products, day = today()) {
    const product = products.find(item => item.id === offer.productId);
    if (!product) return { code: "unlinked", label: "Sin artículo disponible" };
    if (!Object.hasOwn(UNITS, offer.unit) || !offer.title?.trim() || !Number.isFinite(offer.price) || offer.price <= 0 || !Number.isFinite(offer.quantity) || offer.quantity <= 0 || !validDate(offer.startDate) || !validDate(offer.endDate) || offer.startDate && offer.endDate && offer.startDate > offer.endDate) return { code: "incomplete", label: "Completar datos" };
    if (product.unit && product.unit !== offer.unit) return { code: "unit_changed", label: "Revisar unidad del artículo" };
    if (!offer.active) return { code: "paused", label: "Pausada" };
    if (offer.startDate && offer.startDate > day) return { code: "scheduled", label: "Programada" };
    if (offer.endDate && offer.endDate < day) return { code: "expired", label: "Vencida" };
    return { code: "active", label: "Vigente" };
  }
  function normalizeOffers(input, products, existing, createId) {
    if (!Array.isArray(input) || input.length > 200) fail("Se admiten hasta 200 ofertas guardadas.");
    const ids = new Set();
    const normalized = input.map((value, index) => {
      const prefix = `Oferta ${index + 1}: `;
      if (!value || typeof value !== "object") fail(prefix + "datos inválidos.");
      if (value.id && !existing.some(offer => offer.id === value.id)) fail(prefix + "la oferta ya no existe; recargá la pantalla.");
      const id = value.id || createId();
      if (ids.has(id)) fail("Hay ofertas repetidas."); ids.add(id);
      const title = typeof value.title === "string" ? value.title.trim() : "";
      if (!title || title.length > 100 || /[\r\n|;]/.test(title)) fail(prefix + "completá un título de hasta 100 caracteres, sin saltos de línea.");
      const productId = typeof value.productId === "string" ? value.productId : "";
      const product = products.find(item => item.id === productId);
      if (typeof value.active !== "boolean") fail(prefix + "indicá si está activa.");
      if (!["unit_price", "bundle"].includes(value.kind)) fail(prefix + "elegí precio por medida o paquete.");
      if (!Object.hasOwn(UNITS, value.unit)) fail(prefix + "elegí kg, unidades o cajas.");
      if (typeof value.quantity !== "number" || !Number.isFinite(value.quantity) || value.quantity <= 0 || value.quantity > 1000 || Math.abs(value.quantity * 1000 - Math.round(value.quantity * 1000)) > 0.000001) fail(prefix + "cantidad inválida.");
      if (value.kind === "unit_price" && value.quantity !== 1) fail(prefix + "el precio por medida corresponde a 1 kg, unidad o caja.");
      if (value.unit !== "kg" && !Number.isInteger(value.quantity)) fail(prefix + "las unidades y cajas deben ser enteras.");
      if (typeof value.price !== "number" || !Number.isFinite(value.price) || value.price < 0.01 || value.price > 999999999) fail(prefix + "completá un precio de al menos $0,01.");
      if (typeof value.startDate !== "string" || typeof value.endDate !== "string" || !validDate(value.startDate) || !validDate(value.endDate) || value.startDate && value.endDate && value.startDate > value.endDate) fail(prefix + "revisá las fechas de vigencia.");
      if (value.active && !product) fail(prefix + "vinculá un artículo de una lista minorista habilitada antes de activar.");
      if (value.active && product.unit && product.unit !== value.unit) fail(prefix + "la unidad no coincide con la del artículo. Revisala en Editar precios.");
      return { id, audience: "retail", productId, title, kind: value.kind, quantity: value.quantity, unit: value.unit, price: Math.round(value.price * 100) / 100, startDate: value.startDate, endDate: value.endDate, active: value.active };
    });
    for (let i = 0; i < normalized.length; i++) {
      const a = normalized[i]; if (!a.active) continue;
      for (const b of normalized.slice(i + 1)) {
        if (!b.active || a.productId !== b.productId) continue;
        const overlaps = (a.startDate || "0000") <= (b.endDate || "9999") && (b.startDate || "0000") <= (a.endDate || "9999");
        if (overlaps && (a.unit !== b.unit || a.kind === b.kind && a.quantity === b.quantity)) fail(`Hay promociones superpuestas para ${a.title}. Pausá una o separá sus fechas.`);
      }
    }
    return normalized;
  }
  function posterOffer(offer) {
    const amount = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 }).format(offer.quantity);
    let unit = offer.kind === "bundle" ? `PAQUETE ${amount} ${UNITS[offer.unit].toUpperCase()}` : { kg: "EL KG", unit: "LA UNIDAD", box: "LA CAJA" }[offer.unit];
    if (offer.endDate) unit += ` · HASTA ${offer.endDate.split("-").reverse().join("/")}`;
    return { product: offer.title, price: offer.price.toFixed(2).replace(".", ","), unit };
  }
  return { UNITS, today, status, normalizeOffers, posterOffer };
});
