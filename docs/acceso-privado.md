# Acceso privado con cuentas de RR. HH.

Los enlaces `/cliente.html`, `/pedido-mayorista.html` y `/mayorista.html` siguen siendo públicos. El resto de las páginas y consultas exige el correo y contraseña de RR. HH. mediante el diálogo de acceso del navegador, sobre HTTPS en producción.

Se verifica que la cuenta esté activa, tenga un rol válido de RR. HH. y cumpla las mismas reglas de ingreso de Administración: roles administrativos, permisos individuales y socios activos. La contraseña se compara con el hash existente; no se almacena ni se crea una clave nueva. Las consultas a ambas bases son de lectura.

Configurar en el servicio app-pedidos de Render:

- `RRHH_DATABASE_URL`: conexión que ya usa Administración para RR. HH.
- `ADMINISTRATION_DATABASE_URL`: conexión a la base de Administración. Usar una cuenta de lectura si está disponible.

Sin estas conexiones, el acceso privado responde 503 y los clientes siguen accediendo al formulario. No publicar como terminado hasta configurar las conexiones y verificar un acceso autorizado y uno denegado en producción.

Validación focalizada: `node --test test/admin-access.test.js test/public-client-content.test.js test/client-request.test.js test/retail-cart.test.js`.

Los tests de integración históricos acceden directamente a rutas internas sin credenciales: necesitan un entorno de autenticación de prueba antes de poder ejecutarse con el nuevo control. No habilitar una excepción de autenticación en producción para esos tests.
