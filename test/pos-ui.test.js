const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {JSDOM}=require('jsdom');const M=require('../public/pos-model');const C=require('../public/retail-cart-model');
test('escaneo, notas seguras, revisión obligatoria y reintento conserva identificador',async t=>{
 const dom=new JSDOM(fs.readFileSync(path.join(__dirname,'../public/pos.html'),'utf8'),{runScripts:'outside-only',url:'http://localhost/pos.html'});t.after(()=>dom.window.close());
 const w=dom.window;w.POSModel=M;w.RetailCartModel=C;const el=id=>w.document.getElementById(id);const tick=()=>new Promise(r=>setImmediate(r));
 const catalog={products:[{id:'a',name:'ASADO AMERICANO',documentId:'retail',listName:'CARNE MINORISTA.pdf',price:17000,unit:'kg'}],offers:[],revision:'initial'};catalog.mappings=M.defaultMappings(catalog.products);
 const submissions=[];w.fetch=async(url,options)=>{
  if(url.endsWith('catalog'))return {ok:true,json:async()=>catalog};
  const data=JSON.parse(options.body);const q={...C.quote(catalog,data.cart,{deliveryType:'RETIRO'}),quoteId:'q',delivery:0};
  if(url.endsWith('quote'))return {ok:true,json:async()=>q};
  submissions.push(data);if(submissions.length===1)throw new Error('Conexión interrumpida');
  return {ok:true,json:async()=>({...q,number:1,payment:M.payment(data.paymentMethod,data.received,q.total),customer:data.customer,notes:data.notes})};
 };
 w.eval(fs.readFileSync(path.join(__dirname,'../public/pos.js'),'utf8'));await tick();
 el('scanCode').value='2000010001057';el('scanForm').dispatchEvent(new w.Event('submit',{cancelable:true}));
 assert.equal(el('posLines').querySelector('input').value,'0.105');assert.match(el('posTotal').textContent,/1.785/);
 el('saveSale').click();await tick();assert.equal(submissions.length,0);
 el('reviewSale').click();await tick();assert.equal(el('weightsConfirmed').disabled,false);
 const note=el('posLines').querySelector('textarea');note.value='<img src=x onerror=alert(1)> Fino';note.dispatchEvent(new w.Event('input'));assert.equal(el('weightsConfirmed').disabled,true);
 el('reviewSale').click();await tick();el('weightsConfirmed').checked=true;el('posReceived').value='2000';
 el('saveSale').click();await tick();assert.match(el('posMessage').textContent,/Conexión/);assert.equal(el('posLines').children.length,1);
 el('saveSale').click();await tick();assert.equal(submissions.length,2);assert.equal(submissions[0].requestId,submissions[1].requestId);
 assert.equal(el('posLines').children.length,0);assert.match(el('saleReceipt').textContent,/NO VÁLIDO COMO FACTURA/);assert.match(el('saleReceipt').textContent,/215/);assert.equal(el('saleReceipt').querySelector('img'),null);
});
