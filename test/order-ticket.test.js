const test=require('node:test');const assert=require('node:assert/strict');
const format=require('../public/order-ticket');const cart=require('../public/retail-cart-model');
const quote={lines:[{name:'ASADO',listName:'CARNE MINORISTA.pdf',quantity:1.5,unit:'kg',subtotal:22500,offer:'Promoción de prueba',note:'Cortar finito\nSeparar en dos bolsas'}],total:22500,shipping:0,shippingPending:false,notice:cart.NOTICE};
test('ticket conserva cantidades e indicaciones y omite listas, precios, ofertas y total estimado',()=>{
 const detail=cart.detail(quote);const order={retailCart:quote};
 assert.equal(format(order,detail),'1.5 kg - ASADO\n  Aclaración: Cortar finito\nSeparar en dos bolsas');
 assert.match(detail,/TOTAL ESTIMADO/);assert.equal(quote.total,22500);
});
test('ticket respeta cambios de preparación posteriores al pedido y pedidos escritos',()=>{
 const detail=cart.detail(quote).replace('1.5 kg - ASADO','2 kg - VACÍO').replace('Cortar finito','Cortar grueso')+'\nAgregar huesos para sopa';
 assert.equal(format({retailCart:quote},detail),'2 kg - VACÍO\n  Aclaración: Cortar grueso\nSeparar en dos bolsas\nAgregar huesos para sopa');
 const manual='2 kilos de carne\nPresupuesto $30.000, llamar antes';assert.equal(format({},manual),manual);
});
test('ticket de delivery omite también la estimación de envío',()=>{
 for(const shippingPending of [true,false]){const q={...quote,shippingPending,shipping:15000,total:37500};assert.doesNotMatch(format({retailCart:q},cart.detail(q)),/ESTIMADO|envío|37\.500|CARNE MINORISTA/);}
});
