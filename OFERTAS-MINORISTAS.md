# Ofertas minoristas vinculadas

La sección Placas de ofertas ahora guarda promociones estructuradas que pueden reutilizarse en el futuro carrito minorista. El formulario de pedidos, los pedidos existentes y el circuito mayorista no cambian en esta etapa.

## Uso

1. En **Listas de artículos para minoristas**, revisar las fuentes. Inicialmente se usan las listas cuyos nombres indican minorista o pollo/cerdo, excluyendo mayorista. La selección se puede guardar explícitamente; desde entonces prevalece sobre los nombres.
2. Usar **Agregar oferta**, o **Importar texto como borradores** para conservar y adaptar la placa anterior. La importación interpreta cantidad/precio cuando reconoce el formato, pero no vincula ni activa automáticamente ningún artículo. Revisar cada campo. Si el producto falta, agregarlo a una lista mediante Editar precios y recargar las ofertas.
3. Elegir artículo, nombre en la placa, tipo, cantidad, medida y precio. **Precio por medida** siempre representa 1 kg, unidad o caja. **Paquete** representa una cantidad fija al precio total indicado; 3 kg por $9.900 no es una regla para vender cualquier peso a $3.300/kg.
4. Opcionalmente completar fechas desde/hasta. Las fechas son inclusivas y se evalúan en Argentina. Activar y guardar la promoción. Sin vencimiento permanece activa hasta pausarla; no hay inventario automático.
5. Elegir **Ofertas vinculadas a artículos**, marcar **Incluir en placa** en las promociones vigentes y descargar. Se exige guardar primero y se vuelve a consultar el estado antes de descargar. Los vencimientos aparecen en cada oferta de la imagen.

El modo **Placa anterior: texto libre** mantiene el flujo anterior. Editar ese texto no cambia las ofertas estructuradas. Se conserva como fuente de importación y nunca se publica automáticamente en el catálogo de promociones.

## Artículos y unidades

Cada fila de una lista guardada recibe un identificador persistente. La migración solo agrega identificadores; no altera importes, PDFs, orden ni fecha publicada. Editar un nombre, precio o posición con el editor actual conserva ese identificador. Los clientes antiguos sin identificador pueden conservarlo si el nombre coincide de manera única.

**Editar precios → Venta por** permite definir kilo, unidad o caja. Una oferta activa debe coincidir con la unidad del artículo cuando está definida; si aún no lo está, se exige elegir la medida de la promoción. El futuro carrito deberá completar las unidades base pendientes y calcular del lado del servidor.

Si se elimina un artículo, se quita su lista del catálogo o se cambia su unidad, las ofertas incompatibles dejan de aparecer en las placas vinculadas y en la respuesta pública. Recuperar una versión muy antigua sin identificadores puede requerir volver a vincular sus ofertas. El nombre promocional se conserva aunque cambie el nombre del artículo.

## Persistencia y contrato para el carrito

- `GET/PUT /api/retail-offers/catalog`: listas habilitadas y catálogo con IDs compuestos documento/fila; los cambios usan revisión para detectar conflictos.
- `GET/PUT /api/retail-offers`: promociones administrativas. Cada una tiene ID, `audience: retail`, `productId`, título, tipo, cantidad, unidad, precio total, fechas y activación. Escrituras con revisión y validación de superposiciones ambiguas.
- `GET /api/public-retail-offers`: solo promociones vigentes, activas y con artículo disponible. No publica ofertas mayoristas. Aún no está conectado al formulario del cliente.
- Se usa `app_data`, clave `retail_offers`, con actualización condicional de `updated_at`, o archivo local con reemplazo por renombrado. No requiere SQL nuevo ni credenciales adicionales.
- El borrador de placa conserva `offerMode` y `retailOfferIds` al descargar. La lista de ofertas se guarda independientemente de los textos y datos del local.
- Las imágenes ya descargadas son estáticas: un cambio de oferta exige descargar y publicar una nueva imagen.

## Verificación

La suite cubre reglas por medida/paquete, importes argentinos, vigencia y zona horaria, unidades incompatibles, conflictos, fallas de Supabase, estabilidad de IDs, exclusión del catálogo, conservación del texto anterior y acciones de interfaz. Se probó además en navegador local el ciclo de importar, vincular un paquete de 3 kg por $9.900, activar, guardar, descargar y recargar.
