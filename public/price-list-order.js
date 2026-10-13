(function (root) {
  const normalize = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim().replace(/\s+/g, " ");
  const productName = value => normalize(value).replace(/^\d+\s*[-–—]\s*/, "");
  const wholesaleCuts = ["MOCHO", "PECHO", "PARRILLERO", "BIFE CON LOMO", "ASADO COMPLETO", "DELANTERO", "PISTOLA", "1/2 RES"];
  const groups = ["Pollo", "Cerdo", "Embutidos", "Achuras", "Otros"];
  const namesByGroup = [
    ["CAJON DE POLLO", "POLLO POR KG", "ALITA", "MENUDOS", "SUPREMA", "PATA MUSLO", "3KG PATA Y MUSLO", "PARRILLERO", "CAJA DE SUPREMAS X 15KGS"],
    ["PATITA", "CUERITO", "BONDIOLA FRESCA", "BONDIOLA CONGELADA", "JAMON", "PALETA", "RECORTES DE CERDO", "PAPADA", "PANCETA FRESCA", "PANCETA ENVASADA", "PECHITO CON MANTA", "CARRE", "CHURRASQUITO", "MATAMBRITO"],
    ["SALCHICHA", "CHORIZO TRADICIONAL", "CHORIZO BOMBON", "MORCILLA", "MORCILLA BOMBON", "MORCILLA VASCA", "CHORIZO CASERO", "CHORIZO BOMBON CASERO", "VIENA SIN PIEL", "VIENA CON PIEL LARGA", "VIENA CON PIEL CORTA", "COPETIN", "SALAMIN - LONGANIZA", "CHORIZO COLORADO"],
    ["MOLLEJA", "CHINCHULIN", "MONDONGO", "COGOTERA", "LENGUA", "CENTRO", "RABO", "TRIPA GORDA", "BOFE", "RUEDA", "QUIJADA", "HIGADO", "LIBRILLO", "CORAZON", "RIÑON"]
  ].map(names => names.map(normalize));
  const isBoxes = title => /\bCAJAS\b/.test(normalize(title));
  const isGrouped = title => /\bPOLLO\b/.test(normalize(title)) && /\bCERDO\b/.test(normalize(title));
  function productGroup(row, title) {
    if (!isGrouped(title)) return "";
    const name = productName(row.name).replace(/^CONSULTAR\s+/, "");
    const index = namesByGroup.findIndex(names => names.includes(name));
    return groups[index < 0 ? 4 : index];
  }
  function isWholesale(title) {
    const text = normalize(title);
    return /\bMAYORISTA\b/.test(text) && !/\b(?:POLLO|CERDO|ACHURAS|EMBUTIDOS|CAJAS|GRANGYS)\b/.test(text);
  }
  function compareRows(a, b, title) {
    if (isBoxes(title)) return 0;
    if (isGrouped(title)) {
      const difference = groups.indexOf(productGroup(a, title)) - groups.indexOf(productGroup(b, title));
      if (difference) return difference;
    }
    if (isWholesale(title)) {
      const ai = wholesaleCuts.indexOf(productName(a.name));
      const bi = wholesaleCuts.indexOf(productName(b.name));
      if (ai >= 0 || bi >= 0) return (ai < 0 ? -1 : ai) - (bi < 0 ? -1 : bi);
    }
    const sortName = row => isGrouped(title) ? productName(row.name).replace(/^CONSULTAR\s+/, "") : productName(row.name);
    return sortName(a).localeCompare(sortName(b), "es", { sensitivity: "base", numeric: true });
  }
  function orderPriceList(data) {
    return { ...data, rows: data.rows.map(row => isWholesale(data.title) && productName(row.name) === "1/2 RES" ? { ...row, price: null } : { ...row }).sort((a, b) => compareRows(a, b, data.title)) };
  }
  const api = { compareRows, orderPriceList, productGroup };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PriceListOrder = api;
})(typeof globalThis === "object" ? globalThis : this);
