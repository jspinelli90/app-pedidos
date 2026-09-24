const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
test('caja prueba: ofertas, revisión, pagos, reintentos, códigos y pedidos intactos',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pos-test-'));process.env.DATA_DIR=dir;process.env.PORT='0';process.env.SUPABASE_URL='';process.env.SUPABASE_SERVICE_ROLE_KEY='';
 const {server,startServer}=require('../server');await startServer();t.after(async()=>{await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});});
 const base=`http://127.0.0.1:${server.address().port}`;
 const call=async(p,method='GET',body)=>{const r=await fetch(base+p,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
 const created=(await call('/api/client-documents/create-price-list','POST',{data:{title:'CARNE MINORISTA',notes:'',rows:[{name:'ASADO AMERICANO',price:17000,unit:'kg'},{name:'800 - MAPLE N1',price:7000,unit:'unit'}]},retailEnabled:true})).data;
 let catalog=(await call('/api/pos/catalog')).data;const [meat,egg]=catalog.products;
 assert.equal(catalog.mode,'practice');assert.equal(catalog.mappings.find(m=>m.code==='00001').productId,meat.id);
 const mappings=[...catalog.mappings,{kind:'barcode',code:'123',productId:meat.id}];
 const saved=await call('/api/pos/mappings','PUT',{revision:catalog.revision,mappings});assert.equal(saved.status,200);
 assert.equal((await call('/api/pos/mappings','PUT',{revision:catalog.revision,mappings:[]})).status,409);
 let offers=(await call('/api/retail-offers')).data;
 offers=(await call('/api/retail-offers','PUT',{revision:offers.revision,offers:[{productId:egg.id,title:'Dos maples',kind:'bundle',quantity:2,unit:'unit',price:13000,active:true,startDate:'',endDate:''}]})).data;
 const policy=(await call('/api/public-order-policy?deliveryType=RETIRO')).data;
 const orderDraft={customer:'Cliente de prueba',phone:'1155551234',saleType:'Minorista',deliveryType:'RETIRO',prepDate:policy.minDate,cart:[{productId:meat.id,quantity:1,note:'Fino'}],estimatedAccepted:true,requestId:'pos-source-order-01'};
 const oq=(await call('/api/public-retail-quote','POST',orderDraft)).data;
 const order=(await call('/api/public-orders','POST',{...orderDraft,quoteId:oq.quoteId})).data;
 const originals=(await call('/api/orders')).data;assert.equal(originals.length,1);
 assert.equal((await call('/api/pos/orders')).data[0].lines[0].quantity,1);
 const draft={mode:'practice',cart:[{productId:meat.id,quantity:.105,note:'Fino'},{productId:egg.id,quantity:2,note:''}],delivery:100,sourceOrderId:originals[0].id};
 const q=(await call('/api/pos/quote','POST',draft)).data;assert.equal(q.total,14885);
 const sale={...draft,quoteId:q.quoteId,requestId:'pos-sale-request-0001',weightsConfirmed:true,paymentMethod:'Efectivo',received:15000,customer:'Prueba',notes:'Separar'};
 assert.equal((await call('/api/pos/sales','POST',{...sale,mode:'live'})).status,400);
 assert.equal((await call('/api/pos/sales','POST',{...sale,weightsConfirmed:false})).status,400);
 assert.equal((await call('/api/pos/sales','POST',{...sale,received:100})).status,400);
 assert.equal((await call('/api/pos/sales','POST',{...sale,quoteId:'stale'})).status,409);
 const results=await Promise.all([call('/api/pos/sales','POST',sale),call('/api/pos/sales','POST',sale)]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,201]);assert.equal(results[0].data.id,results[1].data.id);assert.equal(results[0].data.fiscal,false);assert.equal(results[0].data.payment.change,115);
 assert.deepEqual((await call('/api/orders')).data,originals);assert.equal((await call('/api/pos/sales')).data.length,1);
 assert.deepEqual((await call('/api/pos/catalog')).data.mappings,mappings);
 const prices=(await call(`/api/client-documents/${created.document.id}/prices`)).data;
 await call(`/api/client-documents/${created.document.id}/prices`,'PUT',{revision:prices.revision,data:{...prices.data,rows:prices.data.rows.map(r=>({...r,price:r.price+1000}))}});
 assert.equal((await call('/api/pos/sales','POST',{...sale,requestId:'pos-sale-request-0002'})).status,409);
 assert.equal((await call('/api/pos/sales','POST',sale)).data.total,14885);
 await call('/api/orders/'+originals[0].id,'PUT',{...originals[0],detail:'Preparar distinto'});
 assert.deepEqual((await call('/api/pos/orders')).data[0].lines,[]);
});



