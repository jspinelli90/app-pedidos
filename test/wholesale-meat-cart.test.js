require('../test-support/authenticated-server.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {wholesaleMeatCatalog}=require('../lib/wholesale-meat-catalog'),M=require('../public/retail-cart-model'),produce=require('../lib/produce-customer-prices');
test('carne mayorista usa solo su lista, precios por kg y condición de compra de pieza entera',()=>{
  const products=wholesaleMeatCatalog([
    {id:'wholesale',type:'price-list',name:'LISTA PRECIOS CARNE MAYORISTA.pdf',priceData:{rows:[{id:'nalga',name:'NALGA',price:15000,privateCost:5000},{id:'res',name:'1/2 RES',price:null}]}},
    {id:'retail',type:'price-list',name:'CARNE MINORISTA.pdf',priceData:{rows:[{id:'nalga',name:'NALGA',price:20000}]}},
    {id:'pollo',type:'price-list',name:'POLLO MAYORISTA.pdf',priceData:{rows:[{id:'pollo',name:'Pollo',price:1000}]}},
  ]);
  assert.equal(products.length,2);assert.equal(products[0].price,15000);assert.equal(products[0].unit,'kg');assert.equal(products[0].requiresWholePieces,true);assert.equal(products[1].price,null);assert.doesNotMatch(JSON.stringify(products),/privateCost|"price":5000|"price":20000/);
  const quote=M.quote({products,offers:[]},[{productId:'wholesale:nalga',quantity:4.5,unit:'kg',note:'Una nalga entera, toda en milanesas',requiresWholePieces:false}],{deliveryType:'RETIRO'});
  assert.equal(quote.total,67500);assert.equal(quote.lines[0].requiresWholePieces,true);assert.match(quote.notice,/pieza entera/);assert.match(quote.notice,/cortada o preparada/);assert.match(M.detail(quote),/milanesas/);assert.match(M.detail(quote),/kg aproximados - Compra de pieza entera/);
  assert.throws(()=>M.quote({products,offers:[]},[{productId:'wholesale:res',quantity:1,note:''}]),/consultá/);
});
test('pedido mayorista mixto conserva precios mayoristas, pieza entera, preparación y cambios de precio',async t=>{
  process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'wholesale-meat-'));process.env.PORT='0';process.env.SUPABASE_URL='';process.env.SUPABASE_SERVICE_ROLE_KEY='';
  let produceDown=false;t.mock.method(produce,'cart',async()=>{if(produceDown)throw Error('offline');return produce.cartCatalog([{id:'banana',name:'Banana',unit:'KG',salePrice:'3500',offerPrice:'3200',offerQuantity:'2',packageType:'Cajón',packagePrice:'47000'}])});
  const {server,startServer}=require('../server');await startServer();t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`,call=async(route,method='GET',body)=>{const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return{status:r.status,data:await r.json()}};
  async function create(title,price,retailEnabled){return(await call('/api/client-documents/create-price-list','POST',{data:{title,notes:'',rows:[{name:'NALGA',price}]},retailEnabled})).data}
  const saved=await create('CARNE MAYORISTA',15000,false);await create('CARNE MINORISTA',20000,true);
  const catalog=(await call('/api/public-retail-catalog?audience=wholesale')).data,meat=catalog.products.find(p=>p.name==='NALGA');assert.ok(meat);assert.equal(meat.price,15000);assert.equal(catalog.products.filter(p=>p.name==='NALGA').length,1);assert.ok(catalog.products.find(p=>p.id==='produce:banana:crate'));
  const policy=(await call('/api/public-order-policy?deliveryType=RETIRO')).data;
  const payload={customer:'Cliente ficticio',phone:'1155551234',saleType:'Mayorista',deliveryType:'RETIRO',deliveryZone:'REGULAR',prepDate:policy.minDate,cart:[{productId:meat.id,quantity:4.5,unit:'kg',note:'Una nalga entera, toda para milanesas'},{productId:'produce:banana:crate',quantity:1,unit:'unit',note:''}],estimatedAccepted:true,requestId:'wholesale-meat-test-0001'};
  let quote=(await call('/api/public-retail-quote','POST',payload)).data;assert.equal(quote.total,114500);assert.match(quote.notice,/pieza entera/);
  assert.equal((await call('/api/public-orders','POST',{...payload,quoteId:quote.quoteId,estimatedAccepted:false})).status,400);
  const before=(await call(`/api/client-documents/${saved.document.id}/prices`)).data;
  assert.equal((await call(`/api/client-documents/${saved.document.id}/prices`,'PUT',{data:{...before.data,rows:before.data.rows.map(row=>({...row,price:16000}))},revision:before.revision})).status,200);
  assert.equal((await call('/api/public-orders','POST',{...payload,quoteId:quote.quoteId})).status,409);assert.equal((await call('/api/orders')).data.length,0);
  quote=(await call('/api/public-retail-quote','POST',payload)).data;assert.equal(quote.total,119000);assert.equal((await call('/api/public-orders','POST',{...payload,quoteId:quote.quoteId})).status,201);
  const order=(await call('/api/orders')).data[0];assert.equal(order.saleType,'Mayorista');assert.equal(order.retailCart.lines[0].requiresWholePieces,true);assert.match(order.detail,/milanesas/);assert.match(order.detail,/Compra de pieza entera/);assert.equal(order.orderAmount,0);
  produceDown=true;const meatOnly=await call('/api/public-retail-quote','POST',{...payload,cart:[payload.cart[0]]});assert.equal(meatOnly.status,200);assert.equal(meatOnly.data.total,72000);
  const unchanged=(await call('/api/public-retail-catalog')).data.products.find(p=>p.name==='NALGA');assert.equal(unchanged.price,20000);assert.equal(unchanged.requiresWholePieces,undefined);
});
