const listName = document => `${document.name || ''} ${document.priceData?.title || ''}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const isPoultryPork = document => document.type === 'price-list' && /\bpollo\b/i.test(listName(document)) && /\bcerdo\b/i.test(listName(document));
function wholesaleMeatCatalog(documents) {
  const lists = documents.filter(document => {
    if (document.type !== 'price-list' || isPoultryPork(document)) return false;
    const name = listName(document);
    return /\bcarnes?\b/i.test(name) && /\bmayoristas?\b/i.test(name);
  });
  return lists.flatMap(document => (document.priceData?.rows || []).map(row => ({
    id: `${document.id}:${row.id}`, documentId: document.id, rowId: row.id,
    name: row.name, listName: document.name, price: row.price,
    // This list is sold per kg and by whole piece, as confirmed by the owner.
    unit: 'kg', requiresWholePieces: true,
  })));
}
function wholesalePoultryPorkCatalog(documents) {
  return documents.filter(isPoultryPork).flatMap(document => (document.priceData?.rows || []).map(row => ({
    id: `${document.id}:${row.id}`, documentId: document.id, rowId: row.id,
    name: row.name, listName: document.name, price: row.price, unit: row.unit || '',
  })));
}
module.exports = { wholesaleMeatCatalog, wholesalePoultryPorkCatalog };
