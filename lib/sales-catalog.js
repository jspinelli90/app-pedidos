const POS = require('../public/pos-model');
const fail = message => { throw Object.assign(new Error(message), { statusCode: 400 }); };
function validateProducts(input) {
  if (!Array.isArray(input) || !input.length || input.length > 3000) fail('El catálogo debe tener entre 1 y 3000 artículos.');
  const ids = new Set(), codes = new Set();
  return input.map(p => {
    if (!p || typeof p.id !== 'string' || !/^[\w-]{1,80}$/.test(p.id) || ids.has(p.id)) fail('Identificador de artículo inválido o repetido.');
    if (typeof p.code !== 'string' || !/^\d{1,14}$/.test(p.code) || codes.has(p.code)) fail('Código de artículo inválido o repetido.');
    if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 160) fail('Completá el nombre del artículo.');
    if (typeof p.category !== 'string' || !p.category.trim() || p.category.length > 100) fail('Completá el rubro.');
    if (!['','kg','unit','box'].includes(p.unit)) fail('Unidad de venta inválida.');
    if (![null,10.5,21].includes(p.vatRate)) fail('IVA inválido. Se admite 10,5 %, 21 % o pendiente.');
    if (p.price !== null && (typeof p.price !== 'number' || !Number.isFinite(p.price) || p.price < 0 || p.price > 999999999 || Math.abs(p.price * 100 - Math.round(p.price * 100)) > 1e-5)) fail('Precio final inválido.');
    if (p.orderProductId != null && (typeof p.orderProductId !== 'string' || p.orderProductId.length > 170)) fail('Vínculo de pedido inválido.');
    if (p.scalePLU != null && (!/^\d{5}$/.test(p.scalePLU) || p.unit !== 'kg')) fail('El PLU requiere cinco dígitos y venta por kilo.');
    ids.add(p.id); codes.add(p.code);
    return { id:p.id, code:p.code, name:p.name.trim(), category:p.category.trim(), unit:p.unit, vatRate:p.vatRate, price:p.price, orderProductId:p.orderProductId||null, scalePLU:p.scalePLU||null, notes:String(p.notes||'').slice(0,1000) };
  });
}
function mappings(products) {
  return products.flatMap(p => [
    ...(p.code.length!==13 || (POS.validEAN(p.code)&&p.code[0]!=='2') ? [{kind:'barcode',code:p.code,productId:p.id}] : []),
    ...(p.scalePLU ? [{kind:'plu',code:p.scalePLU,productId:p.id}] : [])
  ]);
}
function catalog(state) {
  return {source:'sales',products:state.products.map(p=>({...p,documentId:p.category,listName:p.category})),offers:[],revision:state.revision,mappings:state.mappings??mappings(state.products),mode:'practice'};
}
function orderLines(order, products) {
  const lines=[];const missing=[];
  for (const l of order.retailCart.lines) {
    const matches=products.filter(p=>p.orderProductId===l.productId&&p.unit===l.unit);
    if(matches.length!==1)missing.push(l.name);
    else lines.push({productId:matches[0].id,quantity:l.quantity,unit:l.unit,note:l.note});
  }
  // Never silently recover only part of an order.
  return {lines:missing.length?[]:lines,missing};
}
module.exports={validateProducts,mappings,catalog,orderLines};
