const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const model=require('../public/retail-cart-model'),produce=require('../lib/produce-customer-prices');
test('el cliente encuentra Verdulería, agrega un cajón completo y revisa su estimado',async t=>{
  const dom=new JSDOM(fs.readFileSync(path.resolve('public/cliente.html'),'utf8'),{runScripts:'outside-only',url:'https://example.test/cliente.html'});t.after(()=>dom.window.close());
  const window=dom.window;window.RetailCartModel=model;window.HTMLElement.prototype.scrollIntoView=function(){};
  const catalog=produce.cartCatalog([{id:'banana',name:'Banana',unit:'KG',salePrice:'3500',offerPrice:'3200',offerQuantity:'2',packageType:'Cajón',packagePrice:'47000'}]);
  const tick=()=>new Promise(resolve=>setImmediate(resolve)),el=id=>window.document.getElementById(id);
  window.fetch=async(url,options)=>({ok:true,json:async()=>url.endsWith('catalog')?catalog:{...model.quote(catalog,JSON.parse(options.body).cart,JSON.parse(options.body)),quoteId:'review'}});
  window.eval(fs.readFileSync(path.resolve('public/retail-cart.js'),'utf8'));await tick();window.document.querySelector('input[value="cart"]').click();
  assert.match(el('cartCategory').textContent,/Esenciales - Verdulería/);assert.match(el('cartCatalog').textContent,/2 kg/);
  el('cartSearch').value='cajon';el('cartSearch').dispatchEvent(new window.Event('input'));assert.equal(el('cartCatalog').querySelectorAll('button').length,1);assert.match(el('cartCatalog').textContent,/Cajón completo/);
  el('cartCatalog').querySelector('button').click();const quantity=el('cartLines').querySelector('input');assert.equal(quantity.step,'1');quantity.value='2';quantity.dispatchEvent(new window.Event('input'));
  el('cartReview').click();await tick();el('cartAccepted').checked=true;const payload=window.RetailCartUI.payload();assert.equal(payload.cart[0].productId,'produce:banana:crate');assert.equal(payload.cart[0].quantity,2);assert.match(el('cartEstimate').textContent,/94\.000/);
  quantity.value='1';quantity.dispatchEvent(new window.Event('input'));assert.throws(()=>window.RetailCartUI.payload());
});
