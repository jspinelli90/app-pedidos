# Domicilios de Zona Norte

Desde el 27/11/2026 se restablece el circuito anterior por indicación del usuario: la comprobación automática de calle, altura y partido mediante Georef está desactivada. La falta de coincidencias del proveedor estaba rechazando pedidos de clientes.

Los clientes pueden enviar sus pedidos de delivery regular sin consultar ese servicio ni recibir el error de coincidencia de domicilio. Se conservan los campos de calle/altura, localidad y partido, los requisitos básicos del formulario, los plazos y las reglas específicas de Delivery CABA - viernes.

El local vuelve a verificar el domicilio y la cobertura como parte de su revisión habitual. Los pedidos guardados con el estado histórico `addressValidation.status = review` pueden confirmarse y procesarse normalmente. Sus datos e historial se conservan y los tickets ya no muestran la instrucción del control retirado de no preparar ni despachar.

La biblioteca conserva el código del proveedor para facilitar una futura revisión, pero `enabled = false` evita ejecutarlo desde el circuito de pedidos. Las pruebas de integración comprueban la recepción y los cambios de estado sin consultas a Georef; las pruebas de UI comprueban los pedidos históricos marcados. No se enviaron pedidos de prueba a producción.
