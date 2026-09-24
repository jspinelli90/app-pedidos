(function(root,factory){const format=factory();if(typeof module==='object'&&module.exports)module.exports=format;if(root)root.orderTicketDetail=format;})(typeof window==='undefined'?null:window,function(){
  const money=n=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:2}).format(n);
  return function orderTicketDetail(order,detail){
    if(!order.retailCart?.lines?.length)return detail;
    const cart=order.retailCart;
    // Work on the current detail, not the original snapshot: preparation edits
    // (quantities, substitutions and notes) must remain on the printed ticket.
    let result=detail;
    const footer=`\n\nTOTAL ESTIMADO: ${money(cart.total)}${cart.shippingPending?' + envío a confirmar':` (envío estimado: ${money(cart.shipping)})`}\n${cart.notice}`;
    result=result.replace(footer,'');
    for(const line of cart.lines){
      const suffix=` [${line.listName.replace(/\.pdf$/i,'')}] - Estimado: ${money(line.subtotal)}`;
      result=result.split('\n').map(text=>text.endsWith(suffix)?text.slice(0,-suffix.length):text).join('\n');
      if(line.offer)result=result.replace(`\n  Oferta: ${line.offer}`,'');
    }
    return result.trim();
  };
});
