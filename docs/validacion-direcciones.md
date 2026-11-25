# Validación de domicilios de Zona Norte

Al recibir pedidos públicos minoristas o mayoristas con delivery regular, el servidor comprueba si la calle y altura existen dentro del partido elegido. El domicilio guardado se arma con los mismos campos que se verifican; no se aceptan estados de verificación enviados por el navegador.

- Una coincidencia con calle, altura, coordenadas y partido: verificado, aunque la calle exista en otros partidos o en varias localidades del mismo partido.
- Ninguna coincidencia de calle y altura en el partido: se rechaza el envío (422) y se conservan los datos del formulario para corregirlos. Una mención explícita a CABA también se rechaza en Zona Norte.
- Altura sin ubicación, lista truncada sin coincidencia, domicilio incompleto o servicio no disponible: se recibe como Provisorio con **Dirección pendiente de revisión**.

Los pedidos pendientes pueden usar **Comprobar dirección y confirmar**: el servidor vuelve a consultar el domicilio guardado con el criterio por partido. Si pasa, continúa la confirmación normal; si no, sigue bloqueado. Esto evita exigir revisión manual para coincidencias que la regla anterior consideraba ambiguas. El panel también conserva **Revisar dirección** para la verificación manual expresa con registro del operador. Corregir el domicilio, la modalidad o la zona invalida la verificación anterior. La revisión manual usa la versión y dirección actuales para evitar aprobar cambios de otra sesión.

La consulta utiliza el servicio oficial [Georef](https://www.argentina.gob.ar/georef/normalizacion-de-direcciones), endpoint `https://apis.datos.gob.ar/georef/api/v2.0/direcciones`. Se envían calle y altura, provincia Buenos Aires (06) y el identificador de departamento/partido, sin nombre, teléfono ni piso/departamento reconocidos. Tiempo máximo: 5 segundos. Caché en memoria: 15 minutos, hasta 300 consultas, separada por partido y dirección. No requiere clave ni nueva dependencia.

El criterio pedido por el usuario es existencia en el partido declarado: las calles homónimas en otros lugares no generan alertas. Una coincidencia válida ya alcanza; el campo total del proveedor incluye candidatos aproximados y no invalida esa coincidencia. Georef también devuelve alturas sin coordenadas y nombres aproximados: esos resultados solos no verifican que exista esa altura. Si no puede comprobarse, se conserva la revisión pendiente. La regla no puede inferir la intención de un cliente que indique una calle y altura que efectivamente existen en el partido elegido y también en otro lugar.

Se conservan la validación existente de calles/alturas y las condiciones de Delivery CABA - viernes. Los pedidos para retirar y los pedidos históricos anteriores a este cambio siguen su circuito actual; no se reescribe el historial. Los nuevos pedidos públicos de Zona Norte siempre pasan por este control. Las cargas internas nuevas continúan bajo responsabilidad del operador.

Pruebas: `node --test test/delivery-address*.test.js` y `npm test`. Las pruebas del proveedor utilizan respuestas simuladas para ser deterministas; también se comprobó su respuesta real con una dirección pública de ejemplo. No se enviaron pedidos de prueba al sitio publicado.
