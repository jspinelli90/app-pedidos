(function(root,factory){const model=factory();if(typeof module==='object'&&module.exports)module.exports=model;if(root)root.RetailCartModel=model;})(typeof window==='undefined'?null:window,function(){
  const NOTICE='El importe final se calcula según el peso real de los productos al preparar tu pedido y puede ser mayor o menor al estimado.';
  const UNITS={kg:'kg',unit:'unidad/paquete',box:'caja'};
  const money=n=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:2}).format(n);
  const round=n=>Math.round((n+Number.EPSILON)*100)/100;
  const fail=message=>{throw Object.assign(new Error(message),{statusCode:400});};
  function quote(catalog, input, delivery={}){
    if(!Array.isArray(input)||!input.length||input.length>100)fail('Agregá entre 1 y 100 artículos al carrito.');
    const lines=input.map(value=>{
      const product=catalog.products.find(p=>p.id===value?.productId);
      if(!product)fail('Un artículo ya no está disponible. Actualizá el catálogo.');
      const quantity=value.quantity;
      if(value.unit && value.unit!==product.unit)fail(`${product.name}: cambió la unidad de venta. Quitá el artículo y volvé a agregarlo.`);
      if(!UNITS[product.unit]||product.price===null)fail(`${product.name}: consultá al local antes de pedir este artículo.`);
      if(typeof quantity!=='number'||!Number.isFinite(quantity)||quantity<=0||quantity>1000||Math.abs(quantity*1000-Math.round(quantity*1000))>1e-6||product.unit!=='kg'&&!Number.isInteger(quantity))fail(`${product.name}: revisá la cantidad (${UNITS[product.unit]}).`);
      if(typeof value.note!=='string'||value.note.length>500)fail('Las aclaraciones por artículo admiten hasta 500 caracteres.');
      const offers=catalog.offers.filter(o=>o.productId===product.id&&o.unit===product.unit);
      let rate=product.price;
      let rateOffer=null;
      for(const offer of offers.filter(o=>o.kind==='unit_price'))if(offer.price<rate){rate=offer.price;rateOffer=offer;}
      let subtotal=round(quantity*rate);
      let applied=rateOffer?`${rateOffer.title}: ${money(rate)} por ${UNITS[product.unit]}`:'';
      // Compare each complete promotion plus the remainder at the unit rate.
      // One bundle type per line; never charge a fraction of a promotional pack.
      for(const offer of offers.filter(o=>o.kind==='bundle')){
        const packs=Math.floor((quantity+1e-8)/offer.quantity);
        const remainder=Math.round((quantity-packs*offer.quantity)*1000)/1000;
        const candidate=round(packs*offer.price+remainder*rate);
        if(packs&&candidate<subtotal){subtotal=candidate;applied=`${packs} promoción(es) de ${offer.quantity} ${UNITS[offer.unit]} por ${money(offer.price)}${remainder?` + ${remainder} ${UNITS[product.unit]} a ${money(rate)}`:''}`;}
      }
      return {productId:product.id,name:product.name,listName:product.listName,quantity,unit:product.unit,unitPrice:rate,subtotal,offer:applied,note:value.note.trim()};
    });
    const subtotal=round(lines.reduce((sum,line)=>sum+line.subtotal,0));
    const shipping=delivery.deliveryType==='RETIRO'?0:delivery.deliveryZone==='CABA_VIERNES'?(subtotal>=50000?0:15000):null;
    return {lines,subtotal,shipping,total:round(subtotal+(shipping||0)),shippingPending:shipping===null,notice:NOTICE};
  }
  function detail(quote){return quote.lines.map(line=>`${line.quantity} ${UNITS[line.unit]} - ${line.name} [${line.listName.replace(/\.pdf$/i,'')}] - Estimado: ${money(line.subtotal)}${line.offer?`\n  Oferta: ${line.offer}`:''}${line.note?`\n  Aclaración: ${line.note}`:''}`).join('\n\n')+`\n\nTOTAL ESTIMADO: ${money(quote.total)}${quote.shippingPending?' + envío a confirmar':` (envío estimado: ${money(quote.shipping)})`}\n${NOTICE}`;}
  return {NOTICE,UNITS,money,quote,detail};
});
