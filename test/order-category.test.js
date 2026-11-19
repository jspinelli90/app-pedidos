require('../test-support/authenticated-server.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const C=require('../public/order-category'),Cart=require('../public/retail-cart-model');
test('clasifica escritos, abreviaturas, tildes y textos desconocidos',()=>{
 for(const [detail,value] of [['2 kg asado y un cajón de tomates','mixed'],['NALGA entera para milanesas','meat'],['Papas, ceb y rúcula','essentials'],['Lo mismo de siempre','review'],['2 asados sin verduras','meat'],['Tomates, no agregar carne','essentials'],['1 kg de tomate y 2 bifes','mixed']]) assert.equal(C.classify({detail}).value,value,detail);
});
test('usa identidad del carrito, ignora notas e identifica pedidos modificados',()=>{
 const lines=[{productId:'produce:1:crate',name:'Artículo nuevo',listName:'Esenciales'},{productId:'meat:1',name:'Corte nuevo',listName:'Carne mayorista',note:'sin papa'}];
 assert.equal(C.classify({retailCart:{lines},detail:'otro texto'}).value,'mixed');
 assert.equal(C.classify({retailCart:{lines},detail:'Solo asado',cartDetailChanged:true}).value,'meat');
 assert.equal(C.classify({retailCart:{lines:[lines[0]]}}).value,'essentials');
 assert.equal(C.classify({retailCart:{lines:[lines[1]]}}).value,'meat');
 assert.equal(C.classify({detail:'tomate',categoryOverride:'meat'}).source,'manual');
 assert.equal(C.classify({detail:'tomate',categoryOverride:'invalid'}).value,'essentials');
});
test('guarda correcciones de ambos tipos, las conserva y permite volver a automático sin aceptar cambios públicos',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'order-category-'));process.env.DATA_DIR=dir;process.env.PORT='0';process.env.SUPABASE_URL='';process.env.SUPABASE_SERVICE_ROLE_KEY='';
 const {server,startServer}=require('../server');await startServer();t.after(async()=>{await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});});
 const call=async(url,method='GET',body)=>{const r=await fetch('http://127.0.0.1:'+server.address().port+url,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});assert.ok(r.ok,await r.clone().text());return r.json();};
 for(const saleType of ['Minorista','Mayorista']) {
 let order=await call('/api/orders','POST',{customer:'Prueba',detail:'Asado y tomates',saleType});
 let stored=(await call('/api/orders')).find(o=>o.id===order.id);assert.equal(C.classify(stored).value,'mixed');
 order=await call('/api/orders/'+order.id,'PUT',{...order,categoryOverride:'essentials',currentUser:'Administración'});
 const {categoryOverride,...withoutOverride}=order;
 await call('/api/orders/'+order.id,'PUT',{...withoutOverride,status:'Preparado'});
 stored=(await call('/api/orders')).find(o=>o.id===order.id);assert.equal(C.classify(stored).value,'essentials');assert.equal(C.classify(stored).source,'manual');
 await call('/api/orders/'+order.id,'PUT',{...stored,categoryOverride:''});
 stored=(await call('/api/orders')).find(o=>o.id===order.id);assert.equal(C.classify(stored).value,'mixed');assert.equal(C.classify(stored).source,'automatic');
 }
 const policy=await call('/api/public-order-policy?deliveryType=RETIRO');
 await call('/api/public-orders','POST',{customer:'Público',phone:'1155551234',detail:'Papas',deliveryType:'RETIRO',prepDate:policy.minDate,categoryOverride:'meat'});
 const publicOrder=(await call('/api/orders')).find(o=>o.customer==='Público');assert.equal(C.classify(publicOrder).value,'essentials');assert.equal(C.classify(publicOrder).source,'automatic');
 const movements=await call('/api/movements');assert.ok(movements.some(m=>m.details.includes('Etiqueta')));
 // Existing cart metadata remains trusted when edits only change status.
 const {normalizeOrder}=require('../server');const retailCart={lines:[{productId:'produce:1:kg',name:'Papa',listName:'Esenciales',quantity:1,unit:'kg',subtotal:100,note:''}],total:100,shippingPending:false,shipping:0};
 const existing={retailCart,detail:Cart.detail(retailCart),categoryOverride:'mixed'};
 assert.equal(normalizeOrder({...existing,status:'Preparado'},existing).cartDetailChanged,false);
 assert.equal(normalizeOrder({...existing,detail:'Asado'},existing).cartDetailChanged,true);
});

test('el listado muestra etiquetas de ambos tipos y el editor conserva el detalle al corregirlas',t=>{
 const {JSDOM}=require('jsdom');const dom=new JSDOM(fs.readFileSync(require.resolve('../public/index.html'),'utf8'),{runScripts:'outside-only',url:'https://example.test/'});t.after(()=>dom.window.close());const w=dom.window;
 for(const file of ['order-category.js','retail-cart-model.js']) w.eval(fs.readFileSync(require.resolve('../public/'+file),'utf8'));
 const source=fs.readFileSync(require.resolve('../public/app.js'),'utf8');w.eval(source.slice(0,source.indexOf('els.form.addEventListener("submit"'))+';window.catState=state;');
 const orders=[{id:'a',number:1,customer:'Uno',detail:'asado y tomates',saleType:'Minorista',status:'Nuevo'},{id:'b',number:2,customer:'Dos',detail:'Lo mismo de siempre',saleType:'Mayorista',status:'Nuevo'}];
 w.catState.orders=orders;w.render();
 const badges=w.document.querySelectorAll('.order-category');assert.equal(badges[0].textContent,'Mixto');assert.equal(badges[1].textContent,'Por revisar');
 w.document.querySelectorAll('.edit-order')[1].click();const select=w.document.getElementById('categoryOverride');select.value='mixed';select.dispatchEvent(new w.Event('change'));
 assert.match(w.document.getElementById('categoryPreview').textContent,/Mixto.*manual/);assert.equal(w.document.getElementById('detail').value,'Lo mismo de siempre');assert.equal(w.eval('collectForm().categoryOverride'),'mixed');
 w.catState.orders[1].categoryOverride='mixed';w.render();assert.match(w.document.querySelectorAll('.order-category')[1].textContent,/Mixto.*Manual/);
 select.value='';select.dispatchEvent(new w.Event('change'));assert.match(w.document.getElementById('categoryPreview').textContent,/Por revisar/);
 w.eval('resetForm()');assert.equal(select.value,'');
});
