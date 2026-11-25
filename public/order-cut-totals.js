(function(root, factory) {
  const model = typeof module === 'object' && module.exports
    ? factory(require('./retail-cart-model'), require('./order-ticket'), require('./order-category'))
    : factory(root.RetailCartModel, root.orderTicketDetail, root.OrderCategory);
  if (typeof module === 'object' && module.exports) module.exports = model;
  if (root) root.OrderCutTotals = model;
})(typeof window === 'undefined' ? null : window, function(Cart, ticketDetail, Category) {
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  const names = [
    'Asado', 'Asado americano', 'Asado completo', 'Asado banderita', 'Azotillo', 'Azotillo limpio',
    'Bife ancho', 'Bife angosto', 'Bife de chorizo', 'Bola de lomo', 'Carnaza común', 'Colita de cuadril',
    'Corazón de cuadril', 'Cuadrada', 'Cuadril', 'Entraña', 'Espinazo', 'Falda', 'Hamburguesas',
    'Lomo', 'Matambre', 'Milanesa de carne', 'Milanesa de cerdo', 'Milanesa de pollo', 'Nalga',
    'Ojo de bife', 'Osobuco', 'Paleta', 'Paleta c/hueso', 'Paleta s/hueso', 'Palomita', 'Peceto',
    'Picada', 'Picada especial', 'Picada común', 'Picaña', 'Punta de vacío', 'Recortes', 'Roast beef',
    'Tapa de asado', 'Tapa de bife', 'Tapa de nalga', 'Tortuguita', 'Vacío', 'Alita', 'Menudos',
    'Parrillero', 'Pata y muslo', 'Pollo', 'Suprema', 'Pechuga', 'Bondiola', 'Bondiola congelada',
    'Bondiola fresca', 'Carré', 'Churrasquito', 'Cuerito', 'Jamón', 'Matambrito', 'Panceta',
    'Panceta fresca', 'Papada', 'Patita', 'Pechito con manta', 'Recortes de cerdo', 'Chorizo',
    'Chorizo bombón', 'Chorizo bombón casero', 'Chorizo casero', 'Chorizo colorado', 'Chorizo tradicional',
    'Morcilla', 'Morcilla bombón', 'Morcilla vasca', 'Salamín', 'Salamín - Longaniza', 'Longaniza',
    'Salchicha', 'Bofe', 'Centro', 'Chinchulín', 'Cogotera', 'Corazón', 'Hígado', 'Lengua',
    'Librillo', 'Molleja', 'Mondongo', 'Quijada', 'Rabo', 'Riñón', 'Rueda', 'Tripa gorda',
    'Panceta ahumada', 'Panceta salada', 'Cordero', 'Lechón', 'Conejo', 'Costillar', 'Costilla',
    'Matambre de cerdo', 'Roast beef fresco', 'Peceto envasado', 'Churrasco'
  ];
  const aliases = new Map(names.map(name => [normalize(name), name]));
  for (const [alias, name] of Object.entries({
    'PATA MUSLO': 'Pata y muslo', 'PATAS Y MUSLOS': 'Pata y muslo', 'POLLO POR KG': 'Pollo',
    'ALITAS': 'Alita', 'SUPREMAS': 'Suprema', 'PECHUGAS': 'Pechuga', 'ASADOS': 'Asado',
    'BIFES ANCHOS': 'Bife ancho', 'BIFES ANGOSTOS': 'Bife angosto', 'MILANESAS DE CARNE': 'Milanesa de carne',
    'MILANESAS DE POLLO': 'Milanesa de pollo', 'MILANESAS DE CERDO': 'Milanesa de cerdo',
    'ROSBIF': 'Roast beef', 'ROSS BEEF': 'Roast beef', 'OSSOBUCO': 'Osobuco', 'RINONES': 'Riñón',
    'CARNE PICADA': 'Picada',
    'TAPA ASADO': 'Tapa de asado', 'PECHUGA DE POLLO': 'Pechuga', 'PECHUGAS DE POLLO': 'Pechuga',
    'CARRE DE CERDO': 'Carré', 'MILANESA BOLA DE LOMO': 'Bola de lomo', 'MILANESAS DE BOLA DE LOMO': 'Bola de lomo',
    'MILA BOLA DE LOMO': 'Bola de lomo', 'MILA NALGA': 'Nalga', 'MILANESA DE NALGA': 'Nalga',
    'CHINCHULINES': 'Chinchulín', 'MOLLEJAS': 'Molleja', 'CHORIZOS': 'Chorizo', 'MORCILLAS': 'Morcilla',
    'PALETA CON HUESO': 'Paleta c/hueso', 'PALETA SIN HUESO': 'Paleta s/hueso'
  })) aliases.set(normalize(alias), name);
  const sortedAliases = [...aliases].sort((a, b) => b[0].length - a[0].length);
  const preparations = /^(?:PARA\b|EN\b|CORTAD[OA]S?\b|CORTAR\b|FIN[OA]S?\b|GRUES[OA]S?\b|FETEAD[OA]S?\b|DESGRASAD[OA]S?\b|SIN GRASA\b|ENTER[OA]S?\b|APROX\b)/;

  function cutName(value, structured = false) {
    const key = normalize(String(value || '').replace(/^\d{3,14}\s*[-–]\s*/, '').replace(/\(aprox\.[^)]*\)/ig, ''));
    if (aliases.has(key)) return aliases.get(key);
    if (!structured) {
      for (const [alias, name] of sortedAliases) {
        const suffix = key.slice(alias.length + 1);
        if (key.startsWith(alias + ' ') && preparations.test(suffix) && !/\b(?:Y|O|CON)\b/.test(suffix)) return name;
      }
    }
    return null;
  }

  function isMeatLine(line) {
    if (String(line.productId || '').startsWith('produce:') || /ESENCIALES|VERDULERIA/.test(normalize(line.listName))) return false;
    return !!cutName(line.name, true) || Category.detectText(line.name) === 'meat' || /\b(?:CARNE|CARNES|POLLO|CERDO|CAJAS)\b/.test(normalize(line.listName));
  }

  const amountPattern = /(?<![\d.,/])((?:\d+\s+)?\d+\/\d+|\d+(?:[.,]\d+)?|medio|media|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s*(k(?:g)?s?|kilos?|kilogramos?|gr(?:s)?|g|gramos?)\b(?:\s+y\s+medio)?/gi;
  function gramsOf(match) {
    const words = { medio: .5, media: .5, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };
    let text = match[1].toLowerCase(), quantity;
    if (Object.hasOwn(words, text)) quantity = words[text];
    else if (/^\d+[.,]\d{3}$/.test(text) && !text.startsWith('0')) return null; // ambiguous thousands/decimal notation
    else if (text.includes('/')) {
      const parts = text.split(/\s+/); const fraction = parts.pop().split('/').map(Number);
      quantity = (Number(parts[0]) || 0) + fraction[0] / fraction[1];
    } else quantity = Number(text.replace(',', '.'));
    if (/\by medio$/i.test(match[0])) quantity += .5;
    const grams = quantity * (/^(?:g|gr)/i.test(match[2]) ? 1 : 1000);
    return Number.isFinite(grams) && grams > 0 && grams <= 1e9 && Math.abs(grams - Math.round(grams)) < 1e-6 ? Math.round(grams) : null;
  }

  function summarize(orders) {
    const grouped = new Map(), pending = [], ignored = [];
    const addPending = (order, text, reason) => pending.push({ orderId: order.id, number: order.number, customer: order.customer, date: order.prepDate, text, reason });
    function add(order, name, grams, source, approximate = false) {
      const key = normalize(name);
      if (!grouped.has(key)) grouped.set(key, { name, grams: 0, approximate: false, contributions: [] });
      const row = grouped.get(key); row.grams += grams; row.approximate ||= approximate;
      row.contributions.push({ orderId: order.id, number: order.number, customer: order.customer, date: order.prepDate, grams, source, approximate });
    }
    for (const order of orders) {
      const detail = order.detail || (order.items || []).map(item => `${item.qty} x ${item.name}`).join('\n');
      const cart = order.retailCart;
      const intactCart = cart?.lines?.length && detail === Cart.detail(cart);
      if (intactCart) {
        for (const line of cart.lines) {
          if (!isMeatLine(line)) { ignored.push({ orderId: order.id, text: line.name }); continue; }
          const quantity = line.quantity;
          const grams = typeof quantity === 'number' ? quantity * 1000 : NaN;
          if (line.unit !== 'kg' || !Number.isFinite(grams) || grams <= 0 || Math.abs(grams - Math.round(grams)) > 1e-6) {
            addPending(order, `${line.quantity} ${Cart.UNITS[line.unit] || line.unit} - ${line.name}`, 'La cantidad está en cajas/unidades o no tiene un peso válido en kilos.'); continue;
          }
          add(order, cutName(line.name, true) || line.name.trim(), Math.round(grams), 'Carrito', !!(line.requiresWholePieces || line.requiresFullBox));
        }
        continue;
      }
      // Read the current detail after an operator changed a cart. Never total
      // the obsolete snapshot or add the same order twice.
      const current = ticketDetail(order, detail);
      const segments = current.split(/\r?\n|;|(?<!\d),|,(?!\d)|\s+y\s+(?=(?:\d+(?:[.,]\d+|\/\d+)?|medio|un|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s*(?:k(?:g)?s?|kilos?|kilogramos?|gr(?:s)?|g|gramos?)\b)/i).map(text => text.trim()).filter(Boolean);
      if (!segments.length) addPending(order, '(Sin detalle)', 'El pedido no tiene cantidades para totalizar.');
      for (let segment of segments) {
        segment = segment.replace(/^\s*(?:[•*]\s*|-\s+)/, '').replace(/^(?:hola[!.,\s]*)?(?:les\s+)?(?:pido|quiero|quisiera|necesito)\s+/i, '');
        if (/^(?:oferta|aclaraci[oó]n)\s*:/i.test(segment) && cart?.lines?.length) continue;
        if (/^(?:hola|buen[oa]s? d[ií]as|muchas gracias|gracias|por favor)[.!\s]*$/i.test(segment)) continue;
        const matches = [...segment.matchAll(amountPattern)];
        const category = Category.detectText(segment);
        if (category === 'essentials' || category !== 'meat' && category !== 'mixed' && /\b(?:maples?|huevos?|carbon|aceite|pan rallado)\b/i.test(normalize(segment))) { ignored.push({ orderId: order.id, text: segment }); continue; }
        if (matches.length !== 1) { addPending(order, segment, 'Faltan kilos claros o hay varias cantidades en la misma línea.'); continue; }
        const amount = matches[0], grams = gramsOf(amount);
        const before = segment.slice(0, amount.index).replace(/\s+[x×]\s*$/i, '').trim();
        const after = segment.slice(amount.index + amount[0].length).replace(/^\s*aproximados\s*-\s*Compra de (?:pieza entera|caja completa)\s*/i, '').replace(/^\s*[-–:]?\s*(?:de\s+)?/i, '').replace(/[.!]+$/, '').trim();
        let name = null;
        if (!before) name = cutName(after);
        else if (!after || preparations.test(normalize(after))) name = cutName(before.replace(/\s*[-–:]\s*$/, ''));
        if (!grams || !name) { addPending(order, segment, 'No se puede identificar un único corte y su peso con certeza.'); continue; }
        add(order, name, grams, cart?.lines?.length ? 'Detalle modificado' : 'Pedido escrito', /\baproximad[oa]s?\b/i.test(segment));
      }
    }
    const rows = [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
    rows.forEach(row => { row.orderCount = new Set(row.contributions.map(item => item.orderId || item.number)).size; });
    return { rows, pending, ignored, totalGrams: rows.reduce((sum, row) => sum + row.grams, 0), orderCount: orders.length };
  }
  return { summarize };
});
