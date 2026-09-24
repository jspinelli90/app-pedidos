const test=require('node:test');
const assert=require('node:assert/strict');
const M=require('../public/retail-cart-model');
const catalog={products:[{id:'kg',name:'Carne',listName:'Minorista.pdf',unit:'kg',price:10000},{id:'maple',name:'Maple N1',listName:'Huevos.pdf',unit:'unit',price:7000}],offers:[{id:'promo',productId:'maple',kind:'bundle',unit:'unit',quantity:2,price:13000}]};
test('kilos fraccionarios, paquetes completos y sobrante conservan notas y total estimado',()=>{
  const q=M.quote(catalog,[{productId:'kg',quantity:.375,note:'Bifes finitos'},{productId:'maple',quantity:3,note:''}],{deliveryType:'RETIRO'});
  assert.equal(q.total,23750);assert.equal(q.lines[1].subtotal,20000);assert.match(q.lines[1].offer,/1 promoción/);
  assert.match(M.detail(q),/Bifes finitos/);assert.match(M.detail(q),/TOTAL ESTIMADO/);assert.match(M.detail(q),/mayor o menor/);
  assert.equal(M.quote(catalog,[{productId:'maple',quantity:1,note:''}],{deliveryType:'RETIRO'}).total,7000);
});
test('rechaza unidades fraccionarias, cantidades inválidas, artículos ajenos y unidades desconocidas',()=>{
  for(const quantity of [0,-1,NaN,Infinity,1.5,1001])assert.throws(()=>M.quote(catalog,[{productId:'maple',quantity,note:''}]));
  assert.throws(()=>M.quote(catalog,[{productId:'missing',quantity:1,note:''}]));
  assert.throws(()=>M.quote({...catalog,products:[{...catalog.products[0],unit:''}]},[{productId:'kg',quantity:1,note:''}]));
  assert.throws(()=>M.quote({...catalog,products:[{...catalog.products[0],price:null}]},[{productId:'kg',quantity:1,note:''}]));
});
test('envío estimado CABA respeta umbral y zona norte no se presenta como gratis',()=>{
  const lines=[{productId:'kg',quantity:5,note:''}];
  assert.equal(M.quote(catalog,lines,{deliveryType:'DELIVERY',deliveryZone:'CABA_VIERNES'}).shipping,0);
  lines[0].quantity=4.999;
  assert.equal(M.quote(catalog,lines,{deliveryType:'DELIVERY',deliveryZone:'CABA_VIERNES'}).shipping,15000);
  assert.equal(M.quote(catalog,lines,{deliveryType:'DELIVERY'}).shippingPending,true);
});
