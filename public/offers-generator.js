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

  function parseOffers(value) {
    return String(value || "")
      .split(/\r?\n/)
      .map(line => line.trim().replace(/^[-•*]+\s*/, ""))
      .filter(Boolean)
      .map(line => {
        const separated = line.split(/\s*[|;]\s*/);
        if (separated.length >= 2) {
          return {
            product: separated[0].trim(),
            price: separated[1].trim(),
            unit: separated.slice(2).join(" ").trim()
          };
        }
        const matches = [...line.matchAll(/\$\s*\d[\d.,]*|\d[\d.,]*/g)];
        const priceMatch = matches.find(match => match[0].includes("$")) || matches.at(-1);
        if (!priceMatch) return { product: line, price: "CONSULTAR", unit: "" };
        const product = line.slice(0, priceMatch.index).replace(/[-:]+\s*$/, "").trim();
        const unit = line.slice(priceMatch.index + priceMatch[0].length).replace(/^\s*[-:]\s*/, "").trim();
        return { product: product || "OFERTA", price: priceMatch[0], unit };
      });
  }

  function offerCardLayout(count, height) {
    const safeCount = Math.max(1, Number(count) || 1);
    const columns = safeCount <= 6 ? 1 : safeCount <= 16 ? 2 : safeCount <= 30 ? 3 : 4;
    const rows = Math.ceil(safeCount / columns);
    const top = height >= 1800 ? 610 : 445;
    const bottom = height >= 1800 ? 300 : 225;
    const gap = columns === 1 ? 22 : 14;
    const side = 58;
    const width = Math.floor((1080 - side * 2 - gap * (columns - 1)) / columns);
    const cardHeight = Math.floor((height - top - bottom - gap * (rows - 1)) / rows);
    return { top, bottom, gap, side, columns, rows, width, height: cardHeight };
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
    const offers = (data.offers || []).filter(item => item.product || item.price);
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
      const column = index % layout.columns;
      const row = Math.floor(index / layout.columns);
      const x = layout.side + column * (layout.width + layout.gap);
      const y = layout.top + row * (layout.height + layout.gap);
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.roundRect(x, y, layout.width, layout.height, Math.min(22, layout.height * 0.16));
      ctx.fill();

      ctx.textAlign = "left";
      ctx.fillStyle = "#111111";
      const product = String(offer.product || "OFERTA").toUpperCase();
      const padding = Math.max(12, Math.min(28, layout.width * 0.07));
      const productSize = fitText(ctx, product, layout.width - padding * 2, Math.min(44, layout.height * 0.3), 14);
      ctx.font = `900 ${productSize}px Arial, Helvetica, sans-serif`;
      ctx.fillText(product, x + padding, y + layout.height * 0.38);
      ctx.fillStyle = "#555555";
      ctx.font = `700 ${Math.max(13, Math.min(24, layout.height * 0.16))}px Arial, Helvetica, sans-serif`;
      ctx.fillText(String(offer.unit || "").toUpperCase(), x + padding, y + layout.height * 0.68);

      ctx.textAlign = "right";
      ctx.fillStyle = "#111111";
      const price = formatPrice(offer.price);
      const priceSize = fitText(ctx, price, layout.width - padding * 2, Math.min(52, layout.height * 0.34), 16);
      ctx.font = `900 ${priceSize}px Arial, Helvetica, sans-serif`;
      ctx.fillText(price, x + layout.width - padding, y + layout.height * 0.9);
    });

    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    const footerY = height - (height >= 1800 ? 220 : 160);
    ctx.font = `900 ${height >= 1800 ? 28 : 22}px Arial, Helvetica, sans-serif`;
    ctx.fillText(String(data.footer || "PEDIDOS POR WHATSAPP · STOCK LIMITADO").toUpperCase(), width / 2, footerY);
    const contact = [data.phone && `TEL / WHATSAPP ${data.phone}`, data.instagram && `INSTAGRAM ${data.instagram}`].filter(Boolean).join(" · ");
    if (contact) {
      const contactSize = fitText(ctx, contact.toUpperCase(), width - 130, height >= 1800 ? 25 : 19, 14);
      ctx.font = `800 ${contactSize}px Arial, Helvetica, sans-serif`;
      ctx.fillText(contact.toUpperCase(), width / 2, footerY + (height >= 1800 ? 48 : 36));
    }
    if (data.orderLink) {
      const linkSize = fitText(ctx, String(data.orderLink), width - 130, height >= 1800 ? 22 : 17, 13);
      ctx.font = `700 ${linkSize}px Arial, Helvetica, sans-serif`;
      ctx.fillText(String(data.orderLink), width / 2, footerY + (height >= 1800 ? 86 : 66));
    }
    ctx.fillStyle = "#bdbdbd";
    ctx.font = `700 ${height >= 1800 ? 20 : 16}px Arial, Helvetica, sans-serif`;
    ctx.fillText("SAN CAYETANO CARNES", width / 2, height - (height >= 1800 ? 82 : 58));
  }

  return { FORMATS, drawPoster, formatPrice, offerCardLayout, parseOffers, posterDimensions };
});
