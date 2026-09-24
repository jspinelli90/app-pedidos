# Mostrador de prueba

Acceso desde **Mostrador (prueba)** en la pantalla de pedidos, o `/pos.html`.

Esta etapa permite ensayar el mostrador con el catálogo minorista habilitado, sus precios y sus ofertas. No registra caja, stock ni cobros reales y no emite comprobantes fiscales. No reemplaza todavía al sistema de facturación vigente.

1. Escanear en el campo de códigos y finalizar con Enter, o buscar y agregar el artículo.
2. Revisar cantidades, pesos reales, preparación y cargo de entrega.
3. Revisar la venta, confirmar pesos e indicar un medio de pago simulado.
4. Guardar la prueba. Se puede imprimir un comprobante marcado **NO VÁLIDO COMO FACTURA** mediante el diálogo de impresión de Windows.

Las etiquetas fotografiadas usan 13 dígitos: prefijo `2`, PLU de cinco dígitos, peso de seis dígitos en gramos y dígito verificador. Se verificó con `2000010001057`, `2000050022555` y `2000030005653`. Se asocian inicialmente, si existen sin ambigüedad en CARNE MINORISTA, a ASADO AMERICANO, BIFE ANGOSTO y AZOTILLO LIMPIO. El precio se toma del catálogo vigente de la app, no de lo impreso en la etiqueta. Otros formatos de balanza requieren configuración y validación adicional.

En **Códigos de productos** se pueden agregar o corregir asociaciones. Los códigos numéricos al inicio de los nombres de productos se proponen como asociaciones iniciales si son válidos y únicos. Los códigos desconocidos se rechazan: no se adivina el artículo. Las unidades y precios pendientes se completan desde Documentos clientes.

**Recuperar un pedido** copia sus artículos para revisarlos sin alterar el pedido original. Pedidos escritos o cuyo detalle fue modificado se muestran como referencia, para cargar sus artículos manualmente. Mayoristas, cancelados y despachados quedan fuera de esta primera etapa.

Las pruebas se conservan en `app_data.pos_practice` (Supabase) o `pos-practice.json` (local). Las escrituras remotas verifican la versión previa; los reintentos del mismo guardado no duplican la venta. Hasta 1000 pruebas, con las últimas 100 visibles en historial. El borrador aún no guardado se conserva solamente mientras la página permanece abierta; se avisa al salir.

## Pendiente antes de operar fiscalmente

- Catálogo completo de mostrador, PLU de balanza y alícuota de IVA de cada artículo.
- Prueba física de lectura e impresión en la PC Windows con la LEX 850-USE.
- Habilitación y credenciales de facturación, integración y pruebas de homologación ARCA, control de numeración, autorización y recuperación ante fallas.
- Caja real, cierres, anulaciones y comprobantes de ajuste; migración operativa desde el sistema anterior.

No hay integración directa con USB/ESC-POS ni emisión fiscal en esta versión.
