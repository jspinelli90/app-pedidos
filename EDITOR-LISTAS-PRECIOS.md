# Editor de listas de precios

En **Documentos clientes → Listas de precios → Editar precios**, la primera apertura interpreta el PDF vigente. La importación no modifica el documento publicado. Revisar los productos, precios, notas y el texto adicional detectado contra el original antes de confirmar la revisión.

Se pueden modificar precios individuales, agregar o quitar productos, aplicar porcentajes positivos o negativos a todos o a los seleccionados y redondear al múltiplo más cercano de $10, $50, $100 o $500. El último ajuste porcentual puede deshacerse. Un valor vacío se publica como **Consultar**, mientras que cero se conserva como $0,00.

**Previsualizar PDF** muestra una copia sin publicar. **Guardar y actualizar PDF** guarda datos estructurados y una nueva versión del PDF con la identidad de San Cayetano, tabla de productos y notas. El diseño se regenera; no se reproduce exactamente la composición gráfica del PDF de origen. Después de guardar, la edición utiliza los datos guardados sin volver a interpretar el PDF.

El historial permite ver y recuperar cualquier versión, incluido el PDF original exacto. Recuperar conserva la versión anterior. El nombre, identificador, orden y enlace público del documento permanecen estables.

Los PDF nuevos usan un formato compacto en A4: se mantienen los 10 puntos de letra de productos y precios, se reducen espacios y se distribuyen en dos columnas cuando esto ahorra hojas. Cada columna repite Producto/Precio y se lee de arriba hacia abajo, primero la izquierda. Las notas se muestran al final. Para aplicar este formato a un PDF ya guardado, previsualizar y guardar nuevamente desde el editor.

## Almacenamiento y compatibilidad

- Requiere Node 22.13 o superior, hasta Node 24; las versiones de PDF.js y PDFKit están fijadas en el lockfile.
- Usa la tabla existente `app_data`, clave `client_documents`, y el bucket privado existente `client-documents`. No requiere migraciones SQL ni credenciales adicionales.
- Cada PDF generado usa un objeto independiente. Solo después de subirlo se actualizan los metadatos. Una falla de subida o metadatos mantiene publicado el PDF previo. Una falla posterior a la subida puede dejar un objeto huérfano sin publicar; no se elimina automáticamente para evitar afectar recuperaciones.
- Las escrituras de documentos se serializan por proceso. En Supabase, una actualización condicional de `updated_at` detecta cambios de otras instancias. En almacenamiento local se reemplaza el JSON mediante renombrado; usar una sola instancia por directorio de datos.
- Las lecturas públicas omiten datos del editor, historial y rutas de almacenamiento. Las nuevas rutas administrativas siguen el mecanismo de acceso existente de la app.
- No se convierten todas las listas al desplegar. Cada lista conserva su PDF hasta que se guarda desde el editor.
- La importación admite PDFs con texto hasta 50 páginas; no incluye OCR. Los PDFs escaneados sin texto permiten carga manual. Máximo 1000 productos por lista.

## Verificación

`npm ci` y `npm test`. Incluye pruebas de importación de columnas fusionadas, pesos argentinos, generación multipágina, acciones del editor, revisiones concurrentes, recuperación y fallas de almacenamiento. GitHub Actions ejecuta la suite en Node 22 y 24.

Se comprobó la extracción sobre copias de las cinco listas vigentes al 24/09/2026: minorista (37 productos), pollo/cerdo/embutidos/achuras (51), mayorista (49), Grangys (10) y cajas (35). Ocho productos no tenían precio. Las copias reales se usaron fuera del repositorio y no se incluyen como fixtures.

Para revertir el código, revertir el commit de implementación y desplegar. Los PDFs actuales continúan siendo compatibles con el sistema anterior; este no muestra el editor ni el historial. Para recuperar un precio o PDF anterior, usar el historial antes de retirar la funcionalidad.
