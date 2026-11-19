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
test('carne mayorista muestra compra de pieza entera y conserva la preparación de milanesas',async t=>{
  const dom=new JSDOM(fs.readFileSync(path.resolve('public/cliente.html'),'utf8'),{runScripts:'outside-only',url:'https://example.test/pedido-mayorista.html'});t.after(()=>dom.window.close());const w=dom.window;w.RetailCartModel=model;w.HTMLElement.prototype.scrollIntoView=function(){};
  const catalog={products:require('../lib/wholesale-meat-catalog').wholesaleMeatCatalog([{id:'meat',type:'price-list',name:'CARNE MAYORISTA.pdf',priceData:{rows:[{id:'nalga',name:'NALGA',price:15000},{id:'consultar',name:'1/2 RES',price:null}]}}]),offers:[]};
  w.fetch=async(url,options)=>({ok:true,json:async()=>url.includes('catalog')?catalog:{...model.quote(catalog,JSON.parse(options.body).cart,JSON.parse(options.body)),quoteId:'meat-review'}});
  const tick=()=>new Promise(resolve=>setImmediate(resolve)),el=id=>w.document.getElementById(id);
  w.eval(fs.readFileSync(path.resolve('public/retail-cart.js'),'utf8'));await tick();w.document.querySelector('input[value="cart"]').click();
  assert.match(el('cartCatalog').textContent,/Compra de pieza entera/);assert.equal(el('cartCatalog').querySelectorAll('button')[1].disabled,true);
  el('cartCatalog').querySelector('button').click();assert.match(el('cartLines').textContent,/Kilos aproximados de piezas enteras/);assert.equal(el('cartLines').querySelector('details').open,true);
  const quantity=el('cartLines').querySelector('input');quantity.value='4.5';quantity.dispatchEvent(new w.Event('input'));const note=el('cartLines').querySelector('textarea');note.value='Una nalga entera, toda cortada para milanesas';note.dispatchEvent(new w.Event('input'));
  el('cartReview').click();await tick();assert.match(el('cartEstimate').textContent,/cortada o preparada/);assert.match(el('cartAcceptedText').textContent,/pieza entera/);el('cartAccepted').checked=true;const payload=w.RetailCartUI.payload();assert.match(payload.cart[0].note,/milanesas/);assert.equal(payload.cart[0].quantity,4.5);
});
test('carrito mayorista cotiza kilos, ofertas y bultos como Mayorista y conserva el modo escrito',async t=>{
  const dom=new JSDOM(fs.readFileSync(path.resolve('public/cliente.html'),'utf8'),{runScripts:'outside-only',url:'https://example.test/pedido-mayorista.html'});t.after(()=>dom.window.close());const w=dom.window;w.RetailCartModel=model;w.HTMLElement.prototype.scrollIntoView=function(){};
  const all=produce.cartCatalog([{id:'papa',name:'Papa',unit:'KG',salePrice:'2000',offerPrice:'1500',offerQuantity:'2',packageType:'Bolsa',packagePrice:'24000'}]);const catalog=all;let reviewed;
  w.fetch=async(url,options)=>{if(url.includes('catalog')){assert.match(url,/audience=wholesale/);return{ok:true,json:async()=>catalog}}reviewed=JSON.parse(options.body);return{ok:true,json:async()=>({...model.quote(catalog,reviewed.cart,reviewed),quoteId:'whole'})}};
  const tick=()=>new Promise(resolve=>setImmediate(resolve)),el=id=>w.document.getElementById(id);
  w.eval(fs.readFileSync(path.resolve('public/retail-cart.js'),'utf8'));await tick();w.document.querySelector('input[value="cart"]').click();assert.match(el('cartHelp').textContent,/cantidades enteras/);assert.equal(el('cartCatalog').querySelectorAll('button').length,2);assert.match(el('cartCatalog').textContent,/Bolsa completa/);assert.match(el('cartCatalog').textContent,/Oferta: 2 kg/);
  const addBag=Array.from(el('cartCatalog').querySelectorAll('article')).find(article=>article.textContent.includes('Bolsa completa')).querySelector('button');addBag.click();addBag.click();el('cartReview').click();await tick();assert.equal(reviewed.saleType,'Mayorista');el('cartAccepted').checked=true;assert.equal(w.RetailCartUI.payload().cart[0].quantity,2);assert.match(el('cartEstimate').textContent,/48\.000/);
  w.document.querySelector('input[value="text"]').click();el('clientDetail').value='Otro pedido mayorista';assert.deepEqual(Object.keys(w.RetailCartUI.payload()),[]);assert.equal(el('clientDetail').required,true);w.document.querySelector('input[value="cart"]').click();assert.equal(el('cartLines').children.length,1);
});
