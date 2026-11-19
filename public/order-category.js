(function(root, factory) {
  const model = factory();
  if (typeof module === 'object' && module.exports) module.exports = model;
  if (root) root.OrderCategory = model;
})(typeof window === 'undefined' ? null : window, function() {
  const labels = { meat: 'Carnicería', essentials: 'Esenciales', mixed: 'Mixto', review: 'Por revisar' };
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const meat = /\b(?:asad[oa]s?|nalga|pecetos?|vacios?|matambres?|bifes?|bistecs?|cuadrada|cuadril|bola de lomo|lomos?|paletas?|roast beef|rosbif|oss?obuco|picada|carnes?|costillas?|costillares?|entranas?|milanesas?|milas?|hamburguesas?|pollos?|pata muslo|pata y muslo|pechugas?|supremas?|alitas?|menudos|cerdo|bondiolas?|carre|lechon|lechones|chorizos?|choris?|salchichas?|morcillas?|salames?|jamon|panceta|achuras?|chinchulin|chinchulines|mollejas?|rinon|rinones|higado|mondongo|lengua|rabo|patitas)\b/g;
  const essentials = /\b(?:papas?|patatas?|batatas?|cebollas?|ceb|tomates?|tom|lechugas?|zanahorias?|zapallos?|zapallitos?|calabazas?|anco|morron|morrones|pimientos?|aji|ajies|ajos?|perejil|acelga|espinaca|rucula|repollos?|brocoli|coliflor|berenjenas?|pepinos?|choclos?|apio|puerros?|verdeo|remolachas?|zucchinis?|zuchini|chauchas?|arvejas?|habas?|champinon|champinones|hongos?|bananas?|manzanas?|peras?|naranjas?|mandarinas?|limon|limones|pomelos?|duraznos?|ciruelas?|uvas?|frutillas?|melon|melones|sandias?|kiwis?|paltas?|ananas?|frutas?|verduras?|verduleria)\b/g;
  function has(text, pattern) {
    return Array.from(text.matchAll(pattern)).some(match => !/\b(?:sin|no|nada de|no quiero|no agregar|no agregues|quitar|sacar)\s+$/.test(text.slice(Math.max(0, match.index - 22), match.index)));
  }
  function detectText(value) {
    const text = normalize(value), m = has(text, meat), e = has(text, essentials);
    return m && e ? 'mixed' : m ? 'meat' : e ? 'essentials' : 'review';
  }
  function auto(order) {
    const lines = order.retailCart?.lines;
    if (lines?.length && !order.cartDetailChanged) {
      const categories = lines.map(line => {
        if (String(line.productId).startsWith('produce:') || /\b(?:esenciales|verduleria)\b/.test(normalize(line.listName))) return 'essentials';
        // The current catalog separates Esenciales from the butcher shop lists.
        return 'meat';
      });
      if (categories.includes('mixed') || categories.includes('meat') && categories.includes('essentials')) return 'mixed';
      if (categories.includes('review')) return 'review';
      return categories[0];
    }
    return detectText(order.detail || (order.items || []).map(item => item.name).join('\n'));
  }
  function classify(order) {
    if (Object.hasOwn(labels, order.categoryOverride)) return { value: order.categoryOverride, label: labels[order.categoryOverride], source: 'manual' };
    const value = auto(order);
    return { value, label: labels[value], source: 'automatic' };
  }
  return { labels, detectText, classify };
});
