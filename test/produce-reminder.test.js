const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const M=require('../public/retail-cart-model'),{isPublicRequest}=require('../lib/admin-access');
const html=fs.readFileSync(path.resolve('public/cliente.html'),'utf8');
async function setup(t,page){
  const dom=new JSDOM(html,{runScripts:'outside-only',url:'https://example.test/'+page});t.after(()=>dom.window.close());const w=dom.window;
  w.RetailCartModel=M;w.HTMLElement.prototype.scrollIntoView=function(){};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'))};
  const catalog={products:[{id:'meat:one',documentId:'meat',name:'Asado',listName:'Carne',unit:'kg',price:10000},{id:'produce:banana:kg',documentId:'essentials-produce',name:'Banana',listName:'Esenciales - Verdulería',unit:'kg',price:3500}],offers:[]};
  const posts=[];let failPost=false;
  w.fetch=async(url,options={})=>{
    let data={},ok=true,status=200;
    if(url.includes('public-retail-catalog'))data=catalog;
    else if(url.includes('public-order-policy'))data={today:'2026-11-19',minDate:'2026-11-20',afterCutoff:false,deliveryType:'RETIRO',deliveryZone:'REGULAR'};
    else if(url.includes('public-client-documents'))data={'price-list':[],offers:[]};
    else if(url.includes('public-produce-prices'))data={available:true};
    else if(url.includes('public-retail-quote')){const input=JSON.parse(options.body);data={...M.quote(catalog,input.cart,input),quoteId:'quote-test'}}
    else if(url.includes('public-orders')){const input=JSON.parse(options.body);posts.push(input);ok=!failPost;status=ok?201:503;data=ok?{number:posts.length,...(input.cart?{retailCart:M.quote(catalog,input.cart,input)}:{})}:{error:'Intentá nuevamente'};}
    return{ok,status,json:async()=>data,text:async()=>JSON.stringify(data)};
  };
  for(const script of ['retail-cart.js','produce-reminder.js','cliente.js'])w.eval(fs.readFileSync(path.resolve('public',script),'utf8'));
  const tick=async()=>{for(let i=0;i<4;i++)await new Promise(resolve=>setImmediate(resolve))};await tick();
  const el=id=>w.document.getElementById(id);el('clientCustomer').value='Cliente ficticio';el('clientPhone').value='1155551234';el('clientNotes').value='Retirar con cuidado';
  const submit=()=>el('clientOrderForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  async function cart(productId='meat:one'){
    w.document.querySelector('input[value="cart"]').click();const product=catalog.products.find(p=>p.id===productId);
    Array.from(el('cartCatalog').querySelectorAll('article')).find(card=>card.querySelector('strong').textContent===product.name).querySelector('button').click();el('cartReview').click();await tick();el('cartAccepted').checked=true;
  }
  return{w,el,posts,submit,tick,cart,fail:()=>{failPost=true},recover:()=>{failPost=false}};
}
for(const page of ['cliente.html','pedido-mayorista.html']){
  test(page+': escrito ofrece tres opciones, conserva el borrador y reinicia solo al completar el pedido',async t=>{
    const{w,el,posts,submit,tick}=await setup(t,page);el('clientDetail').value='Dos kilos de asado y banana';submit();await tick();
    assert.equal(el('produceReminder').open,true);assert.match(el('produceReminderTitle').textContent,/¿Ya agregaste/);assert.equal(posts.length,0);
    for(const id of ['produceReminderAdd','produceReminderPrices','produceReminderContinue'])assert.ok(el(id));assert.equal(el('produceReminderPrices').target,'_blank');assert.equal(el('produceReminderPrices').getAttribute('href'),'/api/public-produce-prices?formato=pdf');
    el('produceReminderPrices').dispatchEvent(new w.Event('click'));await tick();assert.equal(posts.length,0);assert.equal(el('produceReminder').open,true);
    el('produceReminderAdd').click();await tick();assert.equal(posts.length,0);assert.equal(el('produceReminder').open,false);assert.equal(el('clientDetail').value,'Dos kilos de asado y banana');assert.equal(el('clientNotes').value,'Retirar con cuidado');assert.equal(el('clientCustomer').value,'Cliente ficticio');assert.equal(el('retailCart').hidden,true);assert.equal(el('textProduceSuggestion').hidden,false);
    el('clientDetail').value+=' y 2 kilos de papa';submit();await tick();assert.equal(posts.length,1);assert.match(posts[0].detail,/2 kilos de papa/);assert.equal(posts[0].saleType,page.startsWith('pedido-')?'Mayorista':'Minorista');assert.equal(posts[0].cart,undefined);
    el('clientDetail').value='Otro pedido';submit();await tick();assert.equal(el('produceReminder').open,true);assert.equal(posts.length,1);el('produceReminderClose').click();
  });
  test(page+': agregar Verdulería filtra el carrito y conserva artículos y datos antes de enviar',async t=>{
    const{w,el,posts,submit,tick,cart}=await setup(t,page);await cart();const note=el('cartLines').querySelector('textarea');note.value='Corte fino';note.dispatchEvent(new w.Event('input'));el('cartReview').click();await tick();el('cartAccepted').checked=true;
    submit();await tick();assert.equal(el('produceReminder').open,true);assert.match(el('produceReminderTitle').textContent,/Ahora también/);el('produceReminderAdd').click();await tick();
    assert.equal(posts.length,0);assert.equal(el('cartCategory').value,'essentials-produce');assert.equal(el('cartLines').children.length,1);assert.equal(el('cartLines').querySelector('textarea').value,'Corte fino');assert.equal(el('clientCustomer').value,'Cliente ficticio');assert.match(el('cartCatalog').textContent,/Banana/);
    el('cartCatalog').querySelector('button').click();assert.equal(el('cartAccepted').checked,false);el('cartReview').click();await tick();el('cartAccepted').checked=true;submit();await tick();assert.equal(posts.length,1);assert.equal(posts[0].cart.length,2);assert.equal(el('produceReminder').open,false);
  });
  test(page+': un carrito con Verdulería no muestra el aviso',async t=>{
    const{el,posts,submit,tick,cart}=await setup(t,page);await cart('produce:banana:kg');submit();await tick();assert.equal(posts.length,1);assert.equal(el('produceReminder').open,false);
  });
}
test('continuar no duplica el envío y un fallo no repite el aviso',async t=>{
  const{el,posts,submit,tick,cart,fail,recover}=await setup(t,'cliente.html');await cart();fail();submit();await tick();submit();await tick();assert.equal(el('produceReminder').open,true);assert.equal(posts.length,0);
  el('produceReminderContinue').click();el('produceReminderContinue').click();await tick();assert.equal(posts.length,1);assert.match(el('clientMessage').textContent,/Intentá/);recover();submit();await tick();assert.equal(posts.length,2);assert.equal(posts[0].requestId,posts[1].requestId);
});
test('cerrar el aviso no envía y la falta de soporte del diálogo permite continuar',async t=>{
  const{w,el,posts,submit,tick}=await setup(t,'cliente.html');el('clientDetail').value='Pedido escrito';submit();await tick();el('produceReminder').dispatchEvent(new w.Event('cancel',{cancelable:true}));await tick();assert.equal(posts.length,0);assert.equal(el('produceReminder').open,false);
  w.ProduceReminder.reset();el('produceReminder').showModal=undefined;submit();await tick();assert.equal(posts.length,1);
  assert.equal(isPublicRequest('GET','/produce-reminder.js'),true);assert.equal(isPublicRequest('POST','/produce-reminder.js'),false);
});
