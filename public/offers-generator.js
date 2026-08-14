(function exposeOfferImageGenerator(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.OfferImageGenerator = api;
})(typeof window !== "undefined" ? window : null, function createOfferImageGenerator() {
  const FORMATS = {
    story: { width: 1080, height: 1920 },
    post: { width: 1080, height: 1350 }
  };

  function formatPrice(value) {
    const text = String(value ?? "").trim();
    if (!text) return "CONSULTAR";
    const numeric = Number(text.replaceAll(".", "").replace(",", ".").replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(numeric) || numeric <= 0) return text.toUpperCase();
    return `$${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(numeric)}`;
  }

  function posterDimensions(format) {
    return FORMATS[format] || FORMATS.story;
  }

  function offerCardLayout(count, height) {
    const safeCount = Math.max(1, Math.min(6, Number(count) || 1));
    const top = height >= 1800 ? 660 : 480;
    const bottom = height >= 1800 ? 310 : 230;
    const gap = height >= 1800 ? 30 : 22;
    const available = height - top - bottom - gap * (safeCount - 1);
    return { top, gap, height: Math.max(128, Math.floor(available / safeCount)) };
  }

  function fitText(ctx, text, maxWidth, startSize, minSize = 28) {
    let size = startSize;
    do {
      ctx.font = `900 ${size}px Arial, Helvetica, sans-serif`;
      if (ctx.measureText(text).width <= maxWidth) return size;
      size -= 2;
    } while (size > minSize);
    return minSize;
  }

  function drawPoster(ctx, data, logo) {
    const { width, height } = ctx.canvas;
    const offers = (data.offers || []).filter(item => item.product || item.price).slice(0, 6);
    const visibleOffers = offers.length ? offers : [{ product: "TU OFERTA", price: "0", unit: "EL KILO" }];
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 5;
    ctx.strokeRect(34, 34, width - 68, height - 68);

    if (logo?.complete && logo.naturalWidth) {
      const logoSize = height >= 1800 ? 390 : 300;
      ctx.drawImage(logo, (width - logoSize) / 2, height >= 1800 ? 50 : 20, logoSize, logoSize);
    }

    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.font = `800 ${height >= 1800 ? 34 : 28}px Arial, Helvetica, sans-serif`;
    ctx.letterSpacing = "8px";
    ctx.fillText(String(data.date || "HOY · HASTA AGOTAR STOCK").toUpperCase(), width / 2, height >= 1800 ? 425 : 315);
    ctx.letterSpacing = "0px";

    const title = String(data.title || "OFERTAS DEL DIA").toUpperCase();
    const titleSize = fitText(ctx, title, width - 130, height >= 1800 ? 88 : 72, 42);
    ctx.font = `900 ${titleSize}px Arial, Helvetica, sans-serif`;
    ctx.fillText(title, width / 2, height >= 1800 ? 525 : 400);

    ctx.fillStyle = "#cfcfcf";
    ctx.font = `700 ${height >= 1800 ? 30 : 25}px Arial, Helvetica, sans-serif`;
    ctx.fillText(String(data.subtitle || "CALIDAD SAN CAYETANO").toUpperCase(), width / 2, height >= 1800 ? 585 : 445);

    const layout = offerCardLayout(visibleOffers.length, height);
    visibleOffers.forEach((offer, index) => {
      const y = layout.top + index * (layout.height + layout.gap);
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.roundRect(70, y, width - 140, layout.height, 24);
      ctx.fill();

      ctx.textAlign = "left";
      ctx.fillStyle = "#111111";
      const product = String(offer.product || "OFERTA").toUpperCase();
      const productSize = fitText(ctx, product, 500, Math.min(52, layout.height * 0.32), 27);
      ctx.font = `900 ${productSize}px Arial, Helvetica, sans-serif`;
      ctx.fillText(product, 105, y + layout.height * 0.48);
      ctx.fillStyle = "#555555";
      ctx.font = `700 ${Math.min(28, layout.height * 0.19)}px Arial, Helvetica, sans-serif`;
      ctx.fillText(String(offer.unit || "EL KILO").toUpperCase(), 105, y + layout.height * 0.76);

      ctx.textAlign = "right";
      ctx.fillStyle = "#111111";
      const price = formatPrice(offer.price);
      const priceSize = fitText(ctx, price, 350, Math.min(66, layout.height * 0.43), 35);
      ctx.font = `900 ${priceSize}px Arial, Helvetica, sans-serif`;
      ctx.fillText(price, width - 105, y + layout.height * 0.62);
    });

    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.font = `900 ${height >= 1800 ? 30 : 24}px Arial, Helvetica, sans-serif`;
    ctx.fillText(String(data.footer || "PEDIDOS POR WHATSAPP · STOCK LIMITADO").toUpperCase(), width / 2, height - (height >= 1800 ? 205 : 145));
    ctx.fillStyle = "#bdbdbd";
    ctx.font = `700 ${height >= 1800 ? 24 : 20}px Arial, Helvetica, sans-serif`;
    ctx.fillText("SAN CAYETANO CARNES", width / 2, height - (height >= 1800 ? 145 : 95));
  }

  return { FORMATS, drawPoster, formatPrice, offerCardLayout, posterDimensions };
});
