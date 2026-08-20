(function exposeOfferImageGenerator(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.OfferImageGenerator = api;
})(typeof window !== "undefined" ? window : null, function createOfferImageGenerator() {
  const FORMATS = {
    story: { width: 1080, height: 1920 },
    post: { width: 1080, height: 1350 },
    a4: { width: 2480, height: 3508 },
    "a4-single": { width: 2480, height: 3508 }
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

  function drawContactIcon(ctx, type, x, baseline, size, color = "#ffffff") {
    const top = baseline - size * 0.82;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(2, size * 0.1);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (type === "location") {
      ctx.beginPath();
      ctx.arc(x + size / 2, top + size * 0.38, size * 0.3, Math.PI * 0.15, Math.PI * 0.85, true);
      ctx.lineTo(x + size / 2, top + size);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + size / 2, top + size * 0.37, size * 0.09, 0, Math.PI * 2);
      ctx.fill();
    } else if (type === "instagram") {
      ctx.beginPath();
      ctx.roundRect(x, top, size, size, size * 0.25);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + size / 2, top + size / 2, size * 0.22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + size * 0.76, top + size * 0.25, size * 0.07, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(x + size / 2, top + size * 0.46, size * 0.43, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + size * 0.24, top + size * 0.35);
      ctx.quadraticCurveTo(x + size * 0.42, top + size * 0.72, x + size * 0.74, top + size * 0.68);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + size * 0.18, top + size * 0.76);
      ctx.lineTo(x + size * 0.08, top + size);
      ctx.lineTo(x + size * 0.34, top + size * 0.88);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawIconItems(ctx, items, centerX, baseline, maxWidth, startSize, color = "#ffffff") {
    if (!items.length) return;
    let fontSize = startSize;
    let iconSize;
    let gap;
    let widths;
    let total;
    do {
      iconSize = fontSize * 1.05;
      gap = fontSize * 0.4;
      ctx.font = `800 ${fontSize}px Arial, Helvetica, sans-serif`;
      widths = items.map(item => iconSize + gap + ctx.measureText(item.text).width);
      total = widths.reduce((sum, width) => sum + width, 0) + Math.max(0, items.length - 1) * fontSize * 1.35;
      fontSize -= 1;
    } while (total > maxWidth && fontSize > 12);
    let x = centerX - total / 2;
    ctx.textAlign = "left";
    items.forEach((item, index) => {
      drawContactIcon(ctx, item.type, x, baseline, iconSize, color);
      ctx.fillStyle = color;
      ctx.fillText(item.text, x + iconSize + gap, baseline);
      x += widths[index] + fontSize * 1.35;
    });
    ctx.textAlign = "center";
  }

  function drawPoster(ctx, data, logo, qr) {
    if (data.format === "a4" || data.format === "a4-single") {
      const sheet = ctx.canvas;
      const documentRef = sheet.ownerDocument || (typeof document !== "undefined" ? document : null);
      if (!documentRef) return;
      const flyer = documentRef.createElement("canvas");
      flyer.width = FORMATS.post.width;
      flyer.height = 1527;
      drawPoster(flyer.getContext("2d"), { ...data, format: "post", lightTheme: true }, logo, qr);
      ctx.clearRect(0, 0, sheet.width, sheet.height);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, sheet.width, sheet.height);
      const margin = 40;
      if (data.format === "a4-single") {
        const availableWidth = sheet.width - margin * 2;
        const availableHeight = sheet.height - margin * 2;
        const scale = Math.min(availableWidth / flyer.width, availableHeight / flyer.height);
        const flyerWidth = flyer.width * scale;
        const flyerHeight = flyer.height * scale;
        const x = (sheet.width - flyerWidth) / 2;
        const y = (sheet.height - flyerHeight) / 2;
        ctx.drawImage(flyer, x, y, flyerWidth, flyerHeight);
        return;
      }
      const gap = 20;
      const cellWidth = (sheet.width - margin * 2 - gap) / 2;
      const cellHeight = (sheet.height - margin * 2 - gap) / 2;
      const scale = Math.min(cellWidth / flyer.width, cellHeight / flyer.height);
      const flyerWidth = flyer.width * scale;
      const flyerHeight = flyer.height * scale;
      for (let row = 0; row < 2; row += 1) {
        for (let column = 0; column < 2; column += 1) {
          const cellX = margin + column * (cellWidth + gap);
          const cellY = margin + row * (cellHeight + gap);
          const x = cellX + (cellWidth - flyerWidth) / 2;
          const y = cellY + (cellHeight - flyerHeight) / 2;
          ctx.drawImage(flyer, x, y, flyerWidth, flyerHeight);
        }
      }
      ctx.save();
      ctx.strokeStyle = "#777777";
      ctx.lineWidth = 2;
      ctx.setLineDash([16, 14]);
      ctx.beginPath();
      ctx.moveTo(sheet.width / 2, 16);
      ctx.lineTo(sheet.width / 2, sheet.height - 16);
      ctx.moveTo(16, sheet.height / 2);
      ctx.lineTo(sheet.width - 16, sheet.height / 2);
      ctx.stroke();
      ctx.restore();
      return;
    }
    const { width, height } = ctx.canvas;
    const lightTheme = Boolean(data.lightTheme);
    const backgroundColor = lightTheme ? "#ffffff" : "#050505";
    const foregroundColor = lightTheme ? "#111111" : "#ffffff";
    const offers = (data.offers || []).filter(item => item.product || item.price);
    const visibleOffers = offers.length ? offers : [{ product: "TU OFERTA", price: "0", unit: "EL KILO" }];
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = foregroundColor;
    ctx.lineWidth = 5;
    ctx.strokeRect(34, 34, width - 68, height - 68);

    if (logo?.complete && logo.naturalWidth) {
      const logoSize = height >= 1800 ? 390 : 300;
      ctx.save();
      if (lightTheme) ctx.filter = "invert(1)";
      ctx.drawImage(logo, (width - logoSize) / 2, height >= 1800 ? 50 : 20, logoSize, logoSize);
      ctx.restore();
    }

    ctx.textAlign = "center";
    ctx.fillStyle = foregroundColor;
    ctx.font = `800 ${height >= 1800 ? 34 : 28}px Arial, Helvetica, sans-serif`;
    ctx.letterSpacing = "8px";
    ctx.fillText(String(data.date || "HOY · HASTA AGOTAR STOCK").toUpperCase(), width / 2, height >= 1800 ? 425 : 315);
    ctx.letterSpacing = "0px";

    const title = String(data.title || "OFERTAS DEL DIA").toUpperCase();
    const titleSize = fitText(ctx, title, width - 130, height >= 1800 ? 88 : 72, 42);
    ctx.font = `900 ${titleSize}px Arial, Helvetica, sans-serif`;
    ctx.fillText(title, width / 2, height >= 1800 ? 525 : 400);

    ctx.fillStyle = lightTheme ? "#333333" : "#cfcfcf";
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
      if (lightTheme) {
        ctx.strokeStyle = "#111111";
        ctx.lineWidth = 3;
        ctx.stroke();
      }

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
    ctx.fillStyle = foregroundColor;
    const footerY = height - (height >= 1800 ? 220 : 160);
    ctx.font = `900 ${height >= 1800 ? 28 : 22}px Arial, Helvetica, sans-serif`;
    ctx.fillText(String(data.footer || "PEDIDOS POR WHATSAPP · STOCK LIMITADO").toUpperCase(), width / 2, footerY);
    const hasQr = Boolean(qr?.complete && qr.naturalWidth && data.orderLink);
    const qrSize = height >= 1800 ? 128 : 92;
    const textCenter = hasQr ? width / 2 - qrSize / 2 : width / 2;
    const textWidth = hasQr ? width - qrSize - 230 : width - 130;
    const contactItems = [
      data.phone && { type: "whatsapp", text: String(data.phone) },
      data.instagram && { type: "instagram", text: String(data.instagram) }
    ].filter(Boolean);
    drawIconItems(ctx, contactItems, textCenter, footerY + (height >= 1800 ? 44 : 32), textWidth, height >= 1800 ? 25 : 19, foregroundColor);
    if (data.address) {
      drawIconItems(ctx, [{ type: "location", text: String(data.address) }], textCenter, footerY + (height >= 1800 ? 84 : 62), textWidth, height >= 1800 ? 22 : 17, foregroundColor);
    }
    if (hasQr) {
      const qrX = width - 70 - qrSize;
      const qrY = footerY + (height >= 1800 ? 4 : 1);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(qrX - 8, qrY - 8, qrSize + 16, qrSize + 16);
      ctx.drawImage(qr, qrX, qrY, qrSize, qrSize);
    }
    ctx.fillStyle = lightTheme ? "#333333" : "#bdbdbd";
    ctx.font = `700 ${height >= 1800 ? 20 : 16}px Arial, Helvetica, sans-serif`;
    ctx.fillText("SAN CAYETANO CARNES", width / 2, height - (height >= 1800 ? 82 : 58));
  }

  return { FORMATS, drawPoster, formatPrice, offerCardLayout, parseOffers, posterDimensions };
});
