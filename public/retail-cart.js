(() => {
  if(location.pathname.endsWith('/pedido-mayorista.html'))return;
  const M=window.RetailCartModel;
  const el=id=>document.getElementById(id);
  const state={catalog:null,lines:[],quote:null,requestId:null,busy:false,version:0,mode:'cart'};
  function setMode(mode){
    state.mode=mode;
    const cart=mode==='cart';
    el('retailCart').hidden=!cart;el('retailCart').disabled=!cart;
    el('clientDetailLabel').hidden=cart;el('clientDetail').required=!cart;el('clientDetail').disabled=cart;
    el('textOrderNotice').hidden=cart;
    document.querySelectorAll('input[name="orderMode"]').forEach(input=>{input.checked=input.value===mode;});
    el('clientSubmitButton').textContent=cart?'Enviar pedido con total estimado':'Enviar pedido escrito';
    el('orderModeHelp').textContent=cart?'Elegí productos y cantidades para ver un total estimado.':'Escribí tu pedido como prefieras. Se enviará solo el texto; lo que agregaste al carrito queda guardado mientras estés en esta página.';
    el('clientMessage').textContent='';
  }
  const node=(tag,text,className)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
  const context=()=>({deliveryType:el('clientDeliveryType').value==='RETIRO'?'RETIRO':'DELIVERY',deliveryZone:el('clientDeliveryType').value==='DELIVERY_CABA'?'CABA_VIERNES':'REGULAR'});
  const status=(text,error=false)=>{el('cartStatus').textContent=text;el('cartStatus').className=error?'cart-error':'';};
  function invalidate(){state.version++;state.quote=null;state.requestId=null;el('cartAccepted').checked=false;el('cartAccepted').disabled=true;renderEstimate();}
  function renderEstimate(){
    const box=el('cartEstimate');box.replaceChildren();
    try{
      if(!state.lines.length){box.append(node('strong','Tu carrito está vacío.'));return;}
      const quote=state.quote||M.quote(state.catalog,state.lines,context());
      box.append(node('strong',`TOTAL ESTIMADO: ${M.money(quote.total)}${quote.shippingPending?' + envío a confirmar':''}`));
      box.append(node('p',quote.shippingPending?'El costo de envío no está incluido; lo confirma el local.':`Productos: ${M.money(quote.subtotal)} · Envío estimado: ${M.money(quote.shipping)}`));
      box.append(node('p',M.NOTICE));
      if(context().deliveryZone==='CABA_VIERNES')box.append(node('p','En CABA, el envío se recalcula con el importe final: gratis desde $50.000; por debajo, $15.000.'));
      if(!state.quote)box.append(node('p','Revisá el total antes de enviar para confirmar precios y ofertas vigentes.'));
    }catch(error){box.append(node('strong','TOTAL ESTIMADO NO DISPONIBLE'),node('p',error.message));}
    el('cartCount').textContent=`(${state.lines.length})`;
  }
  function renderLines(){
    const box=el('cartLines');box.replaceChildren();
    state.lines.forEach((line,index)=>{
      const p=state.catalog.products.find(p=>p.id===line.productId);
      const card=node('article',undefined,'cart-line');const identity=node('div',undefined,'cart-line-name');identity.append(node('h4',p?.name||'Artículo no disponible'),node('small',p?.listName?.replace(/\.pdf$/i,'')||''));card.append(identity);
      const label=node('label',`Cantidad (${M.UNITS[p?.unit]||'revisar unidad'})`);
      const qty=node('input');qty.type='number';qty.min=p?.unit==='kg'?'0.001':'1';qty.step=p?.unit==='kg'?'0.001':'1';qty.max='1000';qty.value=line.quantity;qty.required=true;
      qty.addEventListener('input',()=>{line.quantity=qty.value===''?null:Number(qty.value);invalidate();updateSubtotal();});label.append(qty);
      const notes=node('details',undefined,'cart-line-notes');notes.open=Boolean(line.note);notes.append(node('summary','Aclarar corte o preparación'));
      const noteLabel=node('label','Aclaración para este artículo');const note=node('textarea');note.rows=2;note.maxLength=500;note.placeholder='Ej.: bifes finitos, sin grasa, separar en dos bolsas';note.value=line.note;
      note.addEventListener('input',()=>{line.note=note.value;invalidate();});noteLabel.append(note);
      notes.append(noteLabel);const subtotal=node('p',undefined,'cart-line-subtotal');
      function updateSubtotal(){try{const q=state.quote?.lines[index]||M.quote(state.catalog,[line],context()).lines[0];subtotal.textContent=`Subtotal estimado: ${M.money(q.subtotal)}${q.offer?` · ${q.offer}`:''}`;}catch(e){subtotal.textContent=e.message;}}
      updateSubtotal();const remove=node('button','Quitar','ghost');remove.type='button';remove.addEventListener('click',()=>{state.lines.splice(index,1);invalidate();renderLines();});
      card.append(label,remove,subtotal,notes);box.append(card);
    });
    el('cartCount').textContent=`(${state.lines.length})`;
  }
  function renderCatalog(){
    const box=el('cartCatalog');box.replaceChildren();if(!state.catalog)return;
    const search=el('cartSearch').value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const products=state.catalog.products.filter(p=>(!el('cartCategory').value||p.documentId===el('cartCategory').value)&&p.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(search));
    products.forEach(p=>{
      const card=node('article',undefined,'cart-product');const identity=node('div',undefined,'cart-product-name');identity.append(node('strong',p.name),node('small',p.listName.replace(/\.pdf$/i,'')));card.append(identity);
      const ready=Boolean(M.UNITS[p.unit])&&p.price!==null;
      card.append(node('p',ready?`${M.money(p.price)} / ${M.UNITS[p.unit]}`:'Consultar al local','cart-product-price'));
      for(const offer of state.catalog.offers.filter(o=>o.productId===p.id))identity.append(node('p',offer.kind==='bundle'?`Oferta: ${offer.quantity} ${M.UNITS[offer.unit]} por ${M.money(offer.price)}`:`Oferta: ${M.money(offer.price)} por ${M.UNITS[offer.unit]}`,'cart-offer'));
      const add=node('button','Agregar','ghost');add.type='button';add.disabled=!ready;
      add.addEventListener('click',()=>{
        const existing=state.lines.find(line=>line.productId===p.id&&!line.note&&line.unit===p.unit&&Number.isFinite(line.quantity));
        if(existing){if(existing.quantity+1>1000)return status('El máximo por artículo es de 1000.',true);existing.quantity=Math.round((existing.quantity+1)*1000)/1000;}
        else {if(state.lines.length>=100)return status('El máximo es de 100 artículos.',true);state.lines.push({productId:p.id,quantity:1,unit:p.unit,note:''});}
        invalidate();renderLines();status(`${p.name} agregado. Indicá la cantidad y cómo querés que lo preparemos.`);
      });card.append(add);box.append(card);
    });
    if(!products.length)box.append(node('p','No encontramos artículos con esa búsqueda.'));
  }
  async function load(){
    status('Cargando productos y ofertas...');
    try{const r=await fetch('/api/public-retail-catalog',{cache:'no-store'});if(!r.ok)throw new Error('No se pudo cargar el catálogo. Tocá Actualizar catálogo para reintentar.');state.catalog=await r.json();
      const category=el('cartCategory');const chosen=category.value;category.replaceChildren(new Option('Todas las listas',''));
      const lists=new Map(state.catalog.products.map(p=>[p.documentId,p.listName]));for(const [id,name]of lists)category.add(new Option(name.replace(/\.pdf$/i,''),id));category.value=chosen;
      invalidate();renderCatalog();renderLines();status('Para pedir un corte con dos preparaciones, escribí su aclaración y volvé a agregarlo.');
    }catch(e){state.quote=null;el('cartAccepted').disabled=true;el('cartAccepted').checked=false;status(e.message,true);}
  }
  async function review(){
    if(state.busy)return;state.busy=true;el('cartReview').disabled=true;
    const version=state.version;
    try{M.quote(state.catalog,state.lines,context());const r=await fetch('/api/public-retail-quote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cart:state.lines,...context()})});const quote=await r.json();if(!r.ok)throw new Error(quote.error);if(version!==state.version)return;
      state.quote=quote;state.requestId=crypto.randomUUID();el('cartAccepted').disabled=false;el('cartAccepted').checked=false;renderLines();renderEstimate();status('Total actualizado. Leé y marcá la aclaración del importe estimado antes de enviar.');el('cartEstimate').scrollIntoView({behavior:'smooth',block:'center'});
    }catch(e){state.quote=null;el('cartAccepted').disabled=true;el('cartAccepted').checked=false;status(e.message,true);}
    finally{state.busy=false;el('cartReview').disabled=false;}
  }
  window.RetailCartUI={
    payload(){if(state.mode==='text'){if(!el('clientDetail').value.trim())throw new Error('Escribí los productos y cantidades de tu pedido.');return {};}if(!state.quote||!el('cartAccepted').checked)throw new Error('Revisá el total estimado y marcá que entendés que puede variar según el peso real.');return {cart:state.lines,quoteId:state.quote.quoteId,estimatedAccepted:true,requestId:state.requestId};},
    changed(){invalidate();},
    reset(){state.lines=[];invalidate();renderLines();setMode(state.mode);},
    receipt(quote,notes){const box=node('div',undefined,'estimate-notice');box.append(node('strong',`TOTAL ESTIMADO: ${M.money(quote.total)}${quote.shippingPending?' + envío a confirmar':''}`),node('p',M.NOTICE));const lines=node('pre',M.detail(quote),'cart-receipt');box.append(lines);if(notes)box.append(node('p',`Observaciones generales: ${notes}`));el('clientSuccess').append(box);}
  };
  el('orderModeChoice').hidden=false;setMode('cart');
  document.querySelectorAll('input[name="orderMode"]').forEach(input=>input.addEventListener('change',()=>setMode(input.value)));
  el('clientBrandIntro').textContent='Armá tu carrito o escribí tu pedido. Elegí la forma que te resulte más cómoda.';
  el('cartSearch').addEventListener('input',renderCatalog);el('cartCategory').addEventListener('change',renderCatalog);
  el('cartReload').addEventListener('click',load);el('cartReview').addEventListener('click',review);el('clientDeliveryType').addEventListener('change',invalidate);
  load();
  window.addEventListener('beforeunload',event=>{if(state.lines.length||el('clientDetail').value.trim()){event.preventDefault();event.returnValue='';}});
})();
