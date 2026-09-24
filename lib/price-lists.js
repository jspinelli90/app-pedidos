const PDFDocument = require("pdfkit");
const path = require("node:path");

function invalid(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

function validatePriceList(input) {
  if (!input || typeof input.title !== "string" || !input.title.trim() || input.title.length > 160) {
    throw invalid("Completá un título de hasta 160 caracteres.");
  }
  if (typeof input.notes !== "string" || input.notes.length > 2000) throw invalid("Las notas no pueden superar los 2000 caracteres.");
  if (!Array.isArray(input.rows) || !input.rows.length || input.rows.length > 1000) throw invalid("La lista debe tener entre 1 y 1000 productos.");
  const rows = input.rows.map((row, index) => {
    if (!row || typeof row.name !== "string" || !row.name.trim() || row.name.length > 160) throw invalid(`Revisá el producto de la fila ${index + 1}.`);
    if (row.price !== null && (typeof row.price !== "number" || !Number.isFinite(row.price) || row.price < 0 || row.price > 999999999)) {
      throw invalid(`Revisá el precio de la fila ${index + 1}. Usá un valor positivo o dejalo vacío para consultar.`);
    }
    return { name: row.name.trim(), price: row.price === null ? null : Math.round((row.price + Number.EPSILON) * 100) / 100 };
  });
  return { title: input.title.trim(), notes: input.notes.trim(), rows };
}

function parsePrice(value) {
  const text = value.trim().replace(/^(?:ARS\s*)?\$\s*/i, "").trim();
  if (!/^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?$/.test(text)) return null;
  const price = Number(text.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(price) && price <= 999999999 ? price : null;
}

// Use coordinates, not stream order: the existing PDFs contain two independent
// product/price columns and some product names include numbers or weights.
function extractRows(items) {
  const lines = [];
  for (const item of items.filter(item => typeof item.str === "string" && item.str.trim()).sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4])) {
    let line = lines.find(line => Math.abs(line.y - item.transform[5]) < 3);
    if (!line) { line = { y: item.transform[5], items: [] }; lines.push(line); }
    line.items.push(item);
  }
  const rows = [];
  const leftovers = [];
  const starts = [];
  const candidates = [];
  for (const line of lines) {
    const cells = line.items.sort((a, b) => a.transform[4] - b.transform[4]).flatMap((cell, index) => {
      // Spreadsheet exports sometimes merge the price of the left column
      // with the name in the right column into a single PDF text run.
      const match = cell.str.match(/^(\d[\d.,]*\d)\s+(.+)$/);
      if (!match || index === 0 || parsePrice(match[1]) === null) return [cell];
      const offset = (match[1].length * 0.51 + 0.3) * Math.abs(cell.transform[0]);
      const transform = [...cell.transform]; transform[4] += offset;
      return [{ ...cell, str: match[1], width: offset }, { ...cell, str: match[2], transform, width: Math.max(0, cell.width - offset) }];
    });
    let pending = [];
    const flush = () => { if (pending.length) candidates.push({ cells: pending, y: line.y }); pending = []; };
    for (const cell of cells) {
      const price = parsePrice(cell.str);
      if (price !== null && pending.some(item => /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(item.str))) {
        const name = pending.map(item => item.str).join(" ").replace(/\s*\$\s*$/, "").trim();
        rows.push({ name, price, x: pending[0].transform[4], y: line.y });
        starts.push(pending[0].transform[4]);
        pending = [];
      } else if (price === null) {
        // A separated name cell starts the second table column even when the
        // first product has no price. Keep that first product for review.
        const previous = pending.at(-1);
        if (previous && cell.transform[4] - (previous.transform[4] + previous.width) > 45 && cell.str.trim() !== "$" && cell.str.trim() !== "-") flush();
        pending.push(cell);
      } else {
        flush();
        leftovers.push(cell.str.trim());
      }
    }
    flush();
  }
  for (const candidate of candidates) {
    const name = candidate.cells.map(cell => cell.str).join(" ").replace(/\s+-$/, "").trim();
    const x = candidate.cells[0].transform[4];
    if (starts.filter(start => Math.abs(start - x) < 5).length >= 3 && /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(name) && !/^(?:\*|ART[IÍ]CULO|PRODUCTO|LISTA|PRECIO|se entregan|se toman pedidos)/i.test(name)) {
      rows.push({ name, price: null, x, y: candidate.y });
    } else leftovers.push(name);
  }
  rows.sort((a, b) => b.y - a.y || a.x - b.x);
  return { rows: rows.map(({ name, price }) => ({ name, price })), leftovers };
}

async function importPriceList(buffer, filename) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: new Uint8Array(buffer), isEvalSupported: false, useSystemFonts: true, verbosity: 0 });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 50) throw invalid("La importación admite hasta 50 páginas. Dividí el PDF en listas más pequeñas.");
    const rows = [], leftovers = [];
    for (let index = 1; index <= pdf.numPages; index++) {
      const page = await pdf.getPage(index);
      const extracted = extractRows((await page.getTextContent()).items);
      rows.push(...extracted.rows);
      leftovers.push(...extracted.leftovers);
      page.cleanup();
    }
    const warnings = ["Revisá los productos, precios y notas contra el PDF original antes de guardar. El nuevo PDF usará el formato de tabla de la app."];
    if (!rows.length) warnings.push("No se detectaron productos con precio. El PDF puede ser una imagen escaneada: cargá las filas manualmente usando el original como referencia.");
    if (rows.some(row => row.price === null)) warnings.push("Hay productos sin precio: se mostrarán como Consultar hasta que completes su valor.");
    return {
      data: { title: filename.replace(/\.pdf$/i, "").slice(0, 160), notes: leftovers.filter(text => /^(?:\*|se entregan|URUGUAY|\d{2}-\d{4}-|SANCAYETANO\.)/i.test(text)).join("\n").slice(0, 2000), rows },
      warnings, unrecognized: leftovers
    };
  } catch (error) {
    if (error.statusCode) throw error;
    throw invalid("No se pudo leer este PDF. Comprobá que no esté dañado o protegido con contraseña.");
  } finally { await task.destroy(); }
}

async function generatePricePdf(input) {
  const data = validatePriceList(input);
  const pdf = new PDFDocument({ size: "A4", margin: 42, bufferPages: true, info: { Title: data.title, Author: "San Cayetano Carnes" } });
  const chunks = [];
  const complete = new Promise((resolve, reject) => { pdf.on("data", chunk => chunks.push(chunk)); pdf.on("end", () => resolve(Buffer.concat(chunks))); pdf.on("error", reject); });
  const margin = 30;
  const width = pdf.page.width - margin * 2;
  const gap = 18;
  const priceText = row => row.price === null ? "Consultar" : row.price.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  pdf.font("Helvetica-Bold").fontSize(15);
  const headerHeight = Math.max(78, pdf.heightOfString(data.title, { width: width - 84 }) + 32);
  const tableTop = headerHeight + 14;
  const rowsTop = tableTop + 27;
  pdf.font("Helvetica").fontSize(9);
  const notesHeight = data.notes ? pdf.heightOfString(data.notes, { width }) + 18 : 0;
  const bottom = 762 - notesHeight;
  pdf.font("Helvetica-Bold").fontSize(10);
  const priceWidth = Math.max(66, ...data.rows.map(row => pdf.widthOfString(priceText(row)) + 2));
  function plan(columns) {
    const columnWidth = (width - gap * (columns - 1)) / columns;
    const nameWidth = columnWidth - priceWidth - 24;
    pdf.font("Helvetica").fontSize(10);
    const rows = data.rows.map(row => ({ row, height: Math.max(20, pdf.heightOfString(row.name, { width: nameWidth }) + 8) }));
    const pages = [];
    let page = [], column = 0, used = 0;
    for (const entry of rows) {
      if (used + entry.height > bottom - rowsTop && used > 0) { column++; used = 0; }
      if (column === columns) { pages.push(page); page = []; column = 0; }
      page.push(entry); used += entry.height;
    }
    if (page.length) pages.push(page);
    // Balance the two product/price blocks on each sheet while retaining order.
    const sheets = pages.map(entries => {
      if (columns === 1) return [entries];
      const total = entries.reduce((sum, entry) => sum + entry.height, 0);
      let sum = 0, best = Infinity, split = 1;
      for (let i = 1; i < entries.length; i++) {
        sum += entries[i - 1].height;
        const height = Math.max(sum, total - sum);
        if (height < best) { best = height; split = i; }
      }
      return [entries.slice(0, split), entries.slice(split)];
    });
    return { columns, columnWidth, nameWidth, sheets };
  }
  const single = plan(1);
  const double = plan(2);
  // Short lists keep their spacious format; long lists gain columns only when
  // that actually reduces the number of sheets. Font sizes never change.
  const layout = double.sheets.length < single.sheets.length ? double : single;
  function heading() {
    pdf.rect(0, 0, pdf.page.width, headerHeight).fill("#080808");
    pdf.rect(0, headerHeight, pdf.page.width, 3).fill("#b21f24");
    pdf.image(path.join(__dirname, "../public/san-cayetano-logo-blanco.png"), margin, 9, { fit: [64, 60] });
    pdf.fillColor("white").font("Helvetica-Bold").fontSize(15).text(data.title, margin + 84, 16, { width: width - 84 });
  }
  layout.sheets.forEach((columns, pageIndex) => {
    if (pageIndex) pdf.addPage();
    heading();
    let endY = rowsTop;
    columns.forEach((entries, columnIndex) => {
      if (!entries.length) return;
      const x = margin + columnIndex * (layout.columnWidth + gap);
      const priceX = x + layout.columnWidth - priceWidth - 7;
      pdf.rect(x, tableTop, layout.columnWidth, 22).fill("#e8eeeb");
      pdf.fillColor("#173c35").font("Helvetica-Bold").fontSize(10).text("PRODUCTO", x + 7, tableTop + 6, { width: layout.nameWidth });
      pdf.text("PRECIO ($)", priceX, tableTop + 6, { width: priceWidth, align: "right" });
      let y = rowsTop;
      entries.forEach(({ row, height }, index) => {
        if (index % 2 === 0) pdf.rect(x, y, layout.columnWidth, height).fill("#f4f7f5");
        pdf.fillColor("#172b25").font("Helvetica").fontSize(10).text(row.name, x + 7, y + 4, { width: layout.nameWidth });
        pdf.font("Helvetica-Bold").text(priceText(row), priceX, y + 4, { width: priceWidth, align: "right" });
        y += height;
      });
      endY = Math.max(endY, y);
    });
    if (data.notes && pageIndex === layout.sheets.length - 1) {
      pdf.fillColor("#4b6159").font("Helvetica").fontSize(9).text(data.notes, margin, endY + 14, { width });
    }
  });
  const range = pdf.bufferedPageRange();
  for (let page = 0; page < range.count; page++) {
    pdf.switchToPage(page);
    pdf.fillColor("#60746a").font("Helvetica").fontSize(8).text(`San Cayetano Carnes  |  ${page + 1} / ${range.count}`, margin, 780, { width, align: "center", lineBreak: false });
  }
  pdf.end();
  return complete;
}

module.exports = { validatePriceList, parsePrice, extractRows, importPriceList, generatePricePdf };
