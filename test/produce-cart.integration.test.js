require('../test-support/authenticated-server.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const produce=require('../lib/produce-customer-prices');
const model=require('../public/retail-cart-model');
const fixtures=[
  {id:'banana',name:'Banana',unit:'KG',salePrice:'3500.000000000000000000000000000000',offerPrice:'3200.000000000000000000000000000000',offerQuantity:'2.000000000000000000000000000000',packageType:'Cajón',packagePrice:'47000',referenceCost:'PRIVATE'},
  {id:'papa',name:'Papa',unit:'KG',salePrice:'2000',packageType:'Bolsa',packagePrice:'24000'},
  {id:'lechuga',name:'Lechuga',unit:'UNIT',salePrice:'1200',offerPrice:'1000',offerQuantity:'2'},
  {id:'bulto',name:'Solo bulto',unit:'KG',packageType:'Bolsa',packagePrice:'12000'},
];
test('catálogo de Verdulería conserva identidad, medidas y precios de paquetes separados',()=>{
  const catalog=produce.cartCatalog(fixtures);assert.equal(catalog.products.length,6);assert.equal(catalog.offers.length,2);assert.doesNotMatch(JSON.stringify(catalog),/PRIVATE|referenceCost/);
  const line=(productId,quantity)=>({productId,quantity,note:'',unit:catalog.products.find(p=>p.id===productId).unit});
  const quote=cart=>model.quote(catalog,cart,{deliveryType:'RETIRO'});
  assert.equal(quote([line('produce:banana:kg',3)]).total,9900);
  assert.equal(quote([line('produce:banana:crate',2)]).total,94000);
  assert.equal(quote([line('produce:papa:kg',1.5)]).total,3000);
  assert.equal(quote([line('produce:papa:bag',1)]).total,24000);
  assert.equal(quote([line('produce:lechuga:unit',3)]).total,3200);
  assert.throws(()=>quote([line('produce:banana:crate',.5)]),/cantidad/);assert.throws(()=>quote([line('produce:lechuga:unit',1.5)]),/cantidad/);
  assert.equal(catalog.offers.some(o=>o.productId.endsWith(':crate')||o.productId.endsWith(':bag')),false);
  const changed=produce.cartCatalog([{...fixtures[0],packageType:'Bolsa',unit:'UNIT'}]);
  assert.equal(changed.products.some(p=>p.id==='produce:banana:crate'||p.id==='produce:banana:kg'),false);
});
test('carrito mixto revalida Administración, guarda cantidades y bultos, rechaza cambios y conserva pedidos previos',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'produce-cart-'));process.env.DATA_DIR=dir;process.env.PORT='0';process.env.SUPABASE_URL='';process.env.SUPABASE_SERVICE_ROLE_KEY='';
  let records=structuredClone(fixtures),unavailable=false;
  t.mock.method(produce,'cart',async()=>{if(unavailable)throw Error('PRIVATE connection failure');return produce.cartCatalog(records)});
  const {server,startServer}=require('../server');await startServer();t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`;
  const call=async(route,method='GET',body)=>{const response=await fetch(base+route,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return{status:response.status,data:await response.json(),cache:response.headers.get('cache-control')}};
  const created=await call('/api/client-documents/create-price-list','POST',{data:{title:'Carne de prueba',notes:'',rows:[{name:'Asado',price:10000,unit:'kg'}]},retailEnabled:true});assert.equal(created.status,201);
  const catalog=await call('/api/public-retail-catalog');assert.equal(catalog.status,200);assert.match(catalog.cache,/no-store/);assert.equal(catalog.data.produceUnavailable,false);
  const meat=catalog.data.products.find(p=>p.name==='Asado');assert.ok(meat);
  const policy=(await call('/api/public-order-policy?deliveryType=RETIRO')).data;
  const payload={customer:'Cliente ficticio',phone:'1155551234',saleType:'Minorista',deliveryType:'RETIRO',deliveryZone:'REGULAR',prepDate:policy.minDate,notes:'Separar verduras',cart:[{productId:meat.id,quantity:1,unit:'kg',note:''},{productId:'produce:banana:kg',quantity:3,unit:'kg',note:'Madura'},{productId:'produce:banana:crate',quantity:1,unit:'unit',note:''},{productId:'produce:papa:bag',quantity:1,unit:'unit',note:''}],estimatedAccepted:true,requestId:'produce-cart-test-0001'};
  const oldQuote=(await call('/api/public-retail-quote','POST',payload)).data;assert.equal(oldQuote.total,90900);
  records[0].salePrice='3600';const stale=await call('/api/public-orders','POST',{...payload,quoteId:oldQuote.quoteId});assert.equal(stale.status,409);assert.equal((await call('/api/orders')).data.length,0);
  const fresh=(await call('/api/public-retail-quote','POST',payload)).data;assert.equal(fresh.total,91000);
  const saved=await call('/api/public-orders','POST',{...payload,quoteId:fresh.quoteId,orderAmount:1,detail:'Monto falso'});assert.equal(saved.status,201);assert.equal(saved.data.retailCart.total,91000);
  const orders=(await call('/api/orders')).data;assert.equal(orders.length,1);assert.equal(orders[0].orderAmount,0);assert.match(orders[0].detail,/Cajón completo/);assert.match(orders[0].detail,/Bolsa completa/);assert.match(orders[0].detail,/Madura/);assert.equal(orders[0].retailCart.lines.length,4);
  records[0].packagePrice='50000';const replay=await call('/api/public-orders','POST',{...payload,quoteId:fresh.quoteId});assert.equal(replay.status,200);assert.equal(replay.data.number,saved.data.number);assert.equal((await call('/api/orders')).data.length,1);
  records[0].packageType='Bolsa';assert.equal((await call('/api/public-retail-quote','POST',payload)).status,400);
  unavailable=true;const partial=await call('/api/public-retail-catalog');assert.equal(partial.data.produceUnavailable,true);assert.ok(partial.data.products.find(p=>p.id===meat.id));
  const failed=await call('/api/public-retail-quote','POST',payload);assert.equal(failed.status,503);assert.match(failed.data.error,/Verdulería/);assert.doesNotMatch(failed.data.error,/PRIVATE/);
  const meatOnly=await call('/api/public-retail-quote','POST',{...payload,cart:[payload.cart[0]]});assert.equal(meatOnly.status,200);assert.equal(meatOnly.data.total,10000);
  unavailable=false;records=structuredClone(fixtures);records[0].offerPrice=null;
  assert.equal((await call('/api/public-retail-quote','POST',{...payload,cart:[payload.cart[1]]})).data.total,10500);
  records[0].offerPrice='3200';const wholesale=await call('/api/public-retail-catalog?audience=wholesale');assert.equal(wholesale.status,200);assert.equal(wholesale.data.products.length,6);assert.equal(wholesale.data.offers.length,2);assert.ok(wholesale.data.products.every(p=>p.documentId==='essentials-produce'));
  const wholesalePayload={...payload,saleType:'Mayorista',sellerCode:'CATA',requestId:'produce-wholesale-test-0001',cart:[{productId:'produce:banana:crate',quantity:1,unit:'unit',note:'Cajón completo'},{productId:'produce:papa:bag',quantity:2,unit:'unit',note:''},payload.cart[1]]};
  const wholesaleQuote=(await call('/api/public-retail-quote','POST',wholesalePayload)).data;assert.equal(wholesaleQuote.total,104900);
  const retailSame=(await call('/api/public-retail-quote','POST',{...wholesalePayload,saleType:'Minorista'})).data;assert.notEqual(retailSame.quoteId,wholesaleQuote.quoteId);
  assert.equal((await call('/api/public-retail-quote','POST',{...wholesalePayload,cart:[payload.cart[1]]})).data.total,9900);assert.equal((await call('/api/public-retail-quote','POST',{...wholesalePayload,cart:[payload.cart[0]]})).status,400);
  assert.equal((await call('/api/public-retail-quote','POST',{...wholesalePayload,cart:[{...wholesalePayload.cart[0],quantity:.5}]})).status,400);
  records[0].packagePrice='48000';assert.equal((await call('/api/public-orders','POST',{...wholesalePayload,quoteId:wholesaleQuote.quoteId})).status,409);
  const updatedWholesale=(await call('/api/public-retail-quote','POST',wholesalePayload)).data;assert.equal(updatedWholesale.total,105900);
  assert.equal((await call('/api/public-orders','POST',{...wholesalePayload,quoteId:updatedWholesale.quoteId})).status,201);
  const storedWholesale=(await call('/api/orders')).data.find(order=>order.saleType==='Mayorista');assert.equal(storedWholesale.retailCart.total,105900);assert.equal(storedWholesale.sellerCode,'CATA');assert.match(storedWholesale.detail,/Bolsa completa/);assert.match(storedWholesale.detail,/Oferta/);assert.equal(storedWholesale.retailCart.lines.length,3);
  assert.equal((await call('/api/public-orders','POST',{...wholesalePayload,quoteId:updatedWholesale.quoteId})).status,200);
  assert.equal((await call('/api/public-orders','POST',{...wholesalePayload,saleType:'Minorista',quoteId:retailSame.quoteId})).status,409);
  unavailable=true;const unavailableWholesale=await call('/api/public-retail-catalog?audience=wholesale');assert.equal(unavailableWholesale.data.produceUnavailable,true);assert.equal(unavailableWholesale.data.products.length,0);unavailable=false;
  const textPayload={...wholesalePayload,cart:undefined,detail:'Pedido mayorista escrito de prueba',requestId:undefined};assert.equal((await call('/api/public-orders','POST',textPayload)).status,201);assert.equal((await call('/api/orders')).data.length,3);
});
