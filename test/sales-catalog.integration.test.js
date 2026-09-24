const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const Model=require('../lib/sales-catalog');
test('catálogo de ventas independiente, IVA incluido, pendientes y revisión ante cambios',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sales-catalog-'));process.env.DATA_DIR=dir;process.env.PORT='0';process.env.SUPABASE_URL='';process.env.SUPABASE_SERVICE_ROLE_KEY='';
 const {server,startServer}=require('../server');await startServer();t.after(async()=>{await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});});
 const base=`http://127.0.0.1:${server.address().port}`;const call=async(url,method='GET',body)=>{const r=await fetch(base+url,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
 await call('/api/client-documents/create-price-list','POST',{data:{title:'CARNE MINORISTA',notes:'',rows:[{name:'ASADO AMERICANO',price:17000,unit:'kg'}]},retailEnabled:true});
 const before=(await call('/api/public-retail-catalog')).data;const initial=(await call('/api/pos/catalog')).data;
 const products=[{id:'infoki-1',code:'1',name:'ASADO AMERICANO',category:'CARNE VACUNA',price:13500,unit:'kg',vatRate:10.5,scalePLU:'00001',orderProductId:before.products[0].id},{id:'infoki-2',code:'2',name:'Pendiente',category:'OTROS',price:500,unit:'',vatRate:null}];
 let result=await call('/api/pos/catalog','PUT',{revision:initial.revision,products});assert.equal(result.status,200);assert.equal(result.data.source,'sales');assert.equal(result.data.products.length,2);
 assert.deepEqual((await call('/api/public-retail-catalog')).data,before);
 assert.equal((await call('/api/pos/catalog','PUT',{revision:initial.revision,products})).status,409);
 const payload={mode:'practice',cart:[{productId:'infoki-1',quantity:2,note:''}]};const quote=(await call('/api/pos/quote','POST',payload)).data;assert.equal(quote.total,27000);assert.equal(quote.lines[0].vatRate,10.5);
 assert.equal((await call('/api/pos/quote','POST',{mode:'practice',cart:[{productId:'infoki-2',quantity:1,note:''}]})).status,400);
 const sale={...payload,quoteId:quote.quoteId,requestId:'sales-independent-01',weightsConfirmed:true,paymentMethod:'Efectivo',received:27000};assert.equal((await call('/api/pos/sales','POST',sale)).status,201);
 result=(await call('/api/pos/catalog')).data;
 const changed=await call('/api/pos/catalog','PUT',{revision:result.revision,products:products.map(p=>({...p,vatRate:21}))});assert.equal(changed.status,200);
 assert.equal((await call('/api/pos/sales','POST',{...sale,requestId:'sales-independent-02'})).status,409);
 assert.equal((await call('/api/pos/sales')).data[0].lines[0].vatRate,10.5);
 assert.equal((await call('/api/pos/mappings','PUT',{revision:changed.data.revision,mappings:changed.data.mappings})).status,200);
 assert.deepEqual((await call('/api/public-retail-catalog')).data,before);
});
test('recuperación de pedidos requiere coincidencia única y nunca omite renglones',()=>{
 const order={retailCart:{lines:[{productId:'retail:a',name:'Carne',unit:'kg',quantity:1,note:'Fino'}]}};
 const p={id:'sales-a',orderProductId:'retail:a',unit:'kg'};
 assert.equal(Model.orderLines(order,[p]).lines[0].productId,'sales-a');
 assert.equal(Model.orderLines(order,[p,{...p,id:'duplicate'}]).lines.length,0);
 assert.deepEqual(Model.orderLines(order,[]).missing,['Carne']);
});
test('conserva ceros iniciales y rechaza códigos, IVA y precios inválidos',()=>{
 const p={id:'one',code:'00001',name:'Uno',category:'Rubro',price:1,unit:'kg',vatRate:10.5};
 assert.equal(Model.validateProducts([p])[0].code,'00001');
 for(const override of [{price:-1},{price:1.001},{vatRate:15},{unit:'litros'}])assert.throws(()=>Model.validateProducts([{...p,...override}]));
 assert.throws(()=>Model.validateProducts([p,p]));
});
