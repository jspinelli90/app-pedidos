const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");
const { sellers, preparationDate, saleType, selectOrders } = require("../public/seller-report");

const columns = ["Pedido", "Fecha de preparación", "Cliente", "Tipo", "Estado"];
const dateLabel = date => date ? date.split("-").reverse().join("/") : "";

async function sellerReportExport(orders, filters, format) {
  const selected = selectOrders(orders, filters);
  const wholesale = selected.filter(order => saleType(order) === "Mayorista").length;
  const title = `Comisiones · ${sellers.get(filters.code)} (${filters.code})`;
  const period = `Preparación desde ${dateLabel(filters.from) || "el inicio"} hasta ${dateLabel(filters.to) || "el fin"} · ${filters.status || "Todos los estados"}`;
  const total = `Pedidos: ${selected.length} · Minoristas: ${selected.length - wholesale} · Mayoristas: ${wholesale}`;
  const rows = selected.map(order => [order.number, dateLabel(preparationDate(order)), order.customer, saleType(order), order.status]);

  if (format === "xlsx") {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Pedidos", { views: [{ state: "frozen", ySplit: 5 }] });
    [12, 24, 42, 18, 18].forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
    for (const line of [title, period, total]) {
      const row = sheet.addRow([line]);
      sheet.mergeCells(row.number, 1, row.number, columns.length);
    }
    sheet.addRow([]);
    sheet.addRow(columns).font = { bold: true };
    sheet.addRows(rows);
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  const document = new PDFDocument({ size: "A4", margin: 36 });
  const chunks = [];
  const buffer = new Promise((resolve, reject) => {
    document.on("data", chunk => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
  });
  document.font("Helvetica-Bold").fontSize(17).text(title);
  document.moveDown(0.45).font("Helvetica").fontSize(10).text(period).text(total).moveDown();
  document.table({
    columnStyles: [48, 100, "*", 76, 82],
    data: [columns.map(text => ({ text, font: { src: "Helvetica-Bold" } })), ...rows],
    defaultStyle: { padding: 5 }
  });
  document.end();
  return buffer;
}

module.exports = { sellerReportExport };
