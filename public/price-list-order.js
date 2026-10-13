(function (root) {
  const normalize = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim().replace(/\s+/g, " ");
  const wholesaleCuts = ["MOCHO", "PECHO", "PARRILLERO", "BIFE CON LOMO", "ASADO COMPLETO", "DELANTERO", "PISTOLA", "1/2 RES"];
  function isWholesale(title) {
    const text = normalize(title);
    return /\bMAYORISTA\b/.test(text) && !/\b(?:POLLO|CERDO|ACHURAS|EMBUTIDOS|CAJAS|GRANGYS)\b/.test(text);
  }
  function compareRows(a, b, title) {
    if (isWholesale(title)) {
      const ai = wholesaleCuts.indexOf(normalize(a.name));
      const bi = wholesaleCuts.indexOf(normalize(b.name));
      if (ai >= 0 || bi >= 0) return (ai < 0 ? -1 : ai) - (bi < 0 ? -1 : bi);
    }
    return String(a.name || "").trim().localeCompare(String(b.name || "").trim(), "es", { sensitivity: "base", numeric: true });
  }
  function orderPriceList(data) {
    return { ...data, rows: data.rows.map(row => isWholesale(data.title) && normalize(row.name) === "1/2 RES" ? { ...row, price: null } : { ...row }).sort((a, b) => compareRows(a, b, data.title)) };
  }
  const api = { compareRows, orderPriceList };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PriceListOrder = api;
})(typeof globalThis === "object" ? globalThis : this);
