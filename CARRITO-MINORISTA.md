# Carrito minorista

Verdulería se incorpora automáticamente desde los precios guardados en Administración, bajo la lista **Esenciales - Verdulería**. Ofrece la venta por kilo o unidad, aplica las promociones por cantidad y agrega por separado las bolsas y cajones completos que tengan precio. Los bultos se piden por cantidades enteras y llevan la presentación en el nombre del artículo y en el pedido. No se aplican promociones por kilo a un bulto completo ni se publican costos internos.

La revisión del total y el envío vuelven a consultar Administración. Un cambio de precios u ofertas requiere nueva aceptación. Si esa conexión falla, se puede seguir consultando y cotizando el resto del catálogo; los pedidos que incluyen Verdulería deben reintentarse cuando se restablezca la consulta de precios. El botón **Actualizar catálogo** conserva los renglones del carrito.

El cliente minorista puede elegir **Comprar con carrito** o **Escribir mi pedido**. Cambiar de modo conserva ambos borradores mientras la página permanece abierta, pero envía solo el modo seleccionado. El campo de texto exige contenido en modo escrito; los controles del carrito quedan deshabilitados para no bloquear el envío. En modo carrito se mantienen la revisión y aceptación del estimado. El pedido escrito no muestra una cotización automática y el local confirma su importe. Tras un envío exitoso se limpian los borradores.

El catálogo usa filas con nombre, lista, precio/oferta y botón Agregar. Los renglones seleccionados muestran cantidad y subtotal, con un desplegable para aclarar el corte o la preparación. El aviso de importe estimado permanece destacado.

`/cliente.html` permite buscar artículos de las listas habilitadas para minoristas, elegir cantidades y escribir una aclaración por renglón. El mismo producto puede agregarse varias veces para preparaciones distintas. El formulario mayorista mantiene su detalle por texto.

Los kilos admiten tres decimales; unidades/paquetes y cajas requieren enteros. Un artículo sin precio o unidad queda visible como consulta y no se puede calcular. Una oferta activa puede aportar la unidad cuando el producto aún no la tiene y todas sus ofertas vigentes coinciden. Definir las demás unidades en Documentos clientes → Editar precios → Venta por. No se deducen unidades por nombre en el código del carrito.

Las ofertas por medida se aplican si mejoran el precio base. Para paquetes, se comparan promociones completas y sobrante al precio por medida; se elige una clase de promoción por renglón. No se combinan paquetes distintos ni cantidades de renglones separados. Vigencia, fuente y unidad se verifican en el servidor.

El aviso de TOTAL ESTIMADO se muestra en el catálogo, el resumen y el comprobante. Es necesario revisar la cotización y marcar que el importe puede variar según el peso real. Editar artículos, notas o entrega invalida la aceptación. Precios u ofertas que cambian antes del envío requieren una nueva revisión. El estimado queda separado del importe final administrativo (`orderAmount`).

Para retiro el envío es cero. CABA estima $15.000 por debajo de $50.000 y cero desde ese importe, aclarando que se recalcula con el peso final. Zona Norte muestra envío a confirmar. Las reglas existentes de fechas, domicilios y horarios siguen vigentes.

El servidor genera el detalle del pedido y guarda una instantánea `retailCart` con cantidades, medidas, precios, promociones y aclaraciones, además de la aceptación. El detalle lleva las instrucciones a las pantallas e impresiones existentes. Las actualizaciones administrativas conservan la instantánea original; el detalle editable sigue siendo lo que usa preparación. Los pedidos antiguos por texto se aceptan por compatibilidad. Los reintentos del carrito con el mismo identificador recuperan el pedido ya guardado.

API: GET `/api/public-retail-catalog`, POST `/api/public-retail-quote`, POST `/api/public-orders` con `cart`, `quoteId`, `estimatedAccepted` y `requestId`. El cliente nunca determina los importes guardados. Las operaciones de pedidos y documentos se serializan en la instancia actual; no se agrega una garantía transaccional entre varias instancias de servidor.

Validación: pruebas de cantidades, paquetes, envíos, cambios de precios, vencimientos, aceptación obligatoria, reintentos concurrentes, conservación al preparar, interfaz y separación mayorista. Prueba completa de envío local y revisión visual en escritorio y celular.
