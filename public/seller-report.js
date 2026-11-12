(function () {
  const sellers = new Map([["CATA", "Víctor Ayala"]]);
  const preparationDate = order => order.prepDate || String(order.createdAt || "").slice(0, 10);
  const saleType = order => order.saleType === "Mayorista" ? "Mayorista" : "Minorista";
  function selectOrders(orders, { code, from, to, status }) {
    return orders.filter(order => {
      const date = preparationDate(order);
      return order.sellerCode === code && (!from || date >= from) &&
        (!to || (date && date <= to)) && (!status || order.status === status);
    }).sort((a, b) => preparationDate(b).localeCompare(preparationDate(a)) || b.number - a.number);
  }
  const report = { sellers, preparationDate, saleType, selectOrders };
  if (typeof module === "object" && module.exports) module.exports = report;
  else window.SellerReport = report;
})();
