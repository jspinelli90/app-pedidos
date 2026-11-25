# Validación de domicilios de Zona Norte

Al recibir pedidos públicos minoristas o mayoristas con delivery regular, el servidor compara la calle y altura con el partido y la localidad elegidos. El domicilio guardado se arma con los mismos campos que se verifican; no se aceptan estados de verificación enviados por el navegador.

- Coincidencia inequívoca con calle, altura, coordenadas, partido y localidad: verificado.
- Coincidencia inequívoca con otro partido o CABA: se rechaza el envío (422) y se conservan los datos del formulario para corregirlos. Una mención explícita a CABA también se rechaza en Zona Norte.
- Calle repetida, altura sin ubicación, respuesta parcial, domicilio incompleto o servicio no disponible: se recibe como Provisorio con **Dirección pendiente de revisión**. No se puede confirmar, preparar ni despachar hasta que el local revise la dirección.

El panel muestra **Revisar dirección**. El operador verifica el domicilio con la clienta o en un mapa y comprueba la cobertura. Si corresponde, aprueba la revisión mediante una acción independiente que registra su identidad y la fecha. Corregir el domicilio, la modalidad o la zona invalida la verificación anterior. La revisión usa la versión y dirección actuales para evitar aprobar cambios de otra sesión.

La consulta utiliza el servicio oficial [Georef](https://www.argentina.gob.ar/georef/normalizacion-de-direcciones), endpoint `https://apis.datos.gob.ar/georef/api/v2.0/direcciones`. Solo se envían calle y altura, sin nombre, teléfono ni piso/departamento reconocidos. Se buscan candidatos en Buenos Aires y CABA **sin filtrar por el partido declarado**. Tiempo máximo: 5 segundos. Caché en memoria: 15 minutos, hasta 300 consultas. No requiere clave ni nueva dependencia.

Limitación: una calle y altura pueden existir en varios municipios. En ese caso no hay información suficiente para determinar cuál quiso indicar la clienta y se exige revisión humana. Georef también devuelve alturas sin coordenadas y nombres aproximados; esos resultados nunca se aprueban automáticamente. Por estas limitaciones, puede haber bastantes pedidos que requieran revisión.

Se conservan la validación existente de calles/alturas y las condiciones de Delivery CABA - viernes. Los pedidos para retirar y los pedidos históricos anteriores a este cambio siguen su circuito actual; no se reescribe el historial. Los nuevos pedidos públicos de Zona Norte siempre pasan por este control. Las cargas internas nuevas continúan bajo responsabilidad del operador.

Pruebas: `node --test test/delivery-address*.test.js` y `npm test`. Las pruebas del proveedor utilizan respuestas simuladas para ser deterministas; también se comprobó su respuesta real con una dirección pública de ejemplo. No se enviaron pedidos de prueba al sitio publicado.
