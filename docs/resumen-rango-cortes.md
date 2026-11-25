# Resumen por fechas y totales por corte

El filtro Preparación desde / Hasta define un rango inclusivo sobre la fecha de preparación del pedido. Hasta es opcional: vacío significa un único día Desde. El listado, Resumen por fechas y Totales por corte comparten los filtros de cliente mayorista/minorista, etiqueta, estado y búsqueda. Para generar informes se requiere Desde y se rechazan rangos invertidos.

El resumen imprimible incluye fecha por pedido y puede ocupar varias páginas A4 apaisadas, con encabezados de tabla repetidos. Se eliminó la reducción de todo el contenido a una sola hoja, que haría ilegible un rango extenso.

Totales por corte abre un informe con kilos solicitados por corte y detalle de los pedidos que componen cada suma. Permite imprimir o guardar como PDF. Los totales incluyen únicamente los estados seleccionados; no son kilos finales pesados al preparar.

Reglas de cálculo:

- Carrito sin modificaciones del detalle: utiliza cantidades estructuradas vendidas por kg. Los pesos aproximados de piezas y cajas conservan esa condición.
- Carrito modificado: utiliza el detalle actual; no vuelve a sumar el carrito original. Ignora el pie de precios/promociones y las aclaraciones del formato del carrito.
- Pedido escrito: acepta una cantidad y un corte inequívocos por renglón o segmento. Reconoce kilos, gramos, decimales con coma o punto, fracciones y expresiones simples como medio kilo. Agrupa tildes, mayúsculas y alias explícitos; mantiene separados cortes como Asado y Asado americano.
- Las cajas, paquetes y piezas vendidas por unidad no se convierten automáticamente a kilos. Tampoco se estiman pesos para cortes sin cantidad o textos ambiguos, ni se interpreta una cantidad compartida como si se aplicara por separado a varios cortes.
- Las cantidades no interpretables quedan en Pendientes de revisión, con el texto original, pedido y motivo. Si hay pendientes, se identifica el total como parcial. Desde allí se puede abrir el pedido para corregir el detalle y recalcular.
- Los productos de verdulería y otros productos que no son cortes quedan fuera. No se suman cantidades escritas solamente en notas generales.

La agregación utiliza gramos enteros para evitar errores de suma de decimales. El informe solo lee los pedidos: no modifica cantidades ni estados y no envía datos a servicios externos.

Pruebas específicas: `node --test test/order-cut-totals.test.js test/order-summary-range-ui.test.js`. La suite completa también cubre los filtros y el resumen de un día existentes.
