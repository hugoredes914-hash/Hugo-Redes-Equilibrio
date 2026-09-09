# Seguridad y recuperación de Equilibrio

## Despliegue

Se requiere Node.js 22 o posterior. Instalar con `npm ci`, ejecutar `npm run lint`, `npm test`, `npm run build` y arrancar con `npm start`. El servidor sirve únicamente `dist/public`; `dist/server.cjs` y su mapa no son archivos públicos. No publicar la carpeta `dist` completa como un sitio estático.

`GEMINI_API_KEY` se configura exclusivamente en los secretos del servidor. No usar variables `VITE_` para secretos. `FIREBASE_PROJECT_ID` corresponde al proyecto configurado; el servidor valida identidad, emisor, audiencia y caducidad del token de Firebase. `GEMINI_MODEL` permite seleccionar un modelo disponible sin modificar la interfaz.

Publicar `firestore.rules` en la base indicada en `firebase.json` antes de activar la nueva aplicación. Usar `firebase deploy --only firestore:rules --project gen-lang-client-0253157680`. No desplegar índices vacíos ni eliminar índices existentes. La base es la base nombrada en `firebase-applet-config.json`, no `(default)`.

Las rutas de IA requieren una cuenta Google verificada y un token Firebase válido. Las cuotas de 10 solicitudes/minuto y 100/día por usuario, y los límites de concurrencia, son por proceso y se reinician con el servidor. Para un límite global entre instancias se necesita almacenamiento compartido o una cuota del proveedor. No representan un límite de facturación. La protección App Check y las restricciones de la clave pública Firebase requieren configurar y verificar los dominios publicados antes de imponerlas.

## Datos y sesiones

Las reglas permiten acceder únicamente a `/users/{uid}` de la identidad autenticada, incluidas sus subcolecciones. Los clientes se eliminan de forma recuperable con `deletedAt`; un administrador puede recuperarlos estableciendo ese campo en cero. El historial se agrega atómicamente. No modificar las reglas para permitir lecturas globales.

Las sesiones nuevas usan almacenamiento por pestaña y Firestore en memoria. No se borra automáticamente la caché de versiones anteriores: podría contener escrituras pendientes. Antes de limpiar los datos del sitio, sincronizar las pestañas antiguas y confirmar el respaldo. Cerrar sesión en equipos compartidos.

Las solicitudes a Gemini piden consentimiento durante la sesión. Los informes omiten nombres y notas de clientes; el análisis de mensajes puede enviar el texto que el usuario selecciona. La información enviada a un proveedor sigue su política de tratamiento de datos. Las respuestas de respaldo local están identificadas.

Calendar conserva la identidad de Firebase y mantiene su autorización solamente en memoria. Primero se guarda el CRM, después se sincroniza la agenda. Cada cliente nuevo utiliza un identificador de evento estable; reconectar Calendar reintenta sincronizaciones pendientes. Los eventos de versiones anteriores que no guardaron identificador requieren conciliación manual: no se eliminan ni se deduplican a ciegas.

## Respaldos

Configuración verificada en Firebase el 9 de septiembre de 2026: copia diaria con retención de 30 días, semanal los domingos con retención de 84 días y recuperación histórica de 7 días. La configuración no demuestra que ya exista una copia completa ni que una restauración haya sido probada. Firebase Authentication requiere un respaldo independiente de Firestore.

En un entorno administrativo con credenciales autorizadas (por ejemplo Cloud Shell), realizar una exportación adicional en una ubicación privada:

```sh
export FIREBASE_PROJECT_ID=gen-lang-client-0253157680
export FIRESTORE_DATABASE_ID=ai-studio-43d21bee-8742-40a3-b27b-74b4266bb83b
node scripts/backup.mjs export /ruta/privada/equilibrio.backup.json
node scripts/backup.mjs verify /ruta/privada/equilibrio.backup.json
```

El script incluye subcolecciones incluso si sus documentos padres no existen, usuarios de Authentication y un hash SHA-256. Los archivos se crean con permisos privados y sin sobrescribir archivos existentes. La exportación es secuencial; coordinar una ventana sin escrituras para consistencia entre colecciones, o usar una copia administrada de Firestore. No subir respaldos, datos personales ni credenciales a GitHub.

Para verificar recuperación, iniciar emuladores locales vacíos de Firestore y Authentication y usar:

```sh
FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node scripts/backup.mjs restore-test /ruta/privada/equilibrio.backup.json
```

El script impide restaurar en producción. Compara todos los documentos y verifica que existan los UID recuperados. Está preparado para las cuentas Google de esta aplicación; si se agregan usuarios con contraseña se debe ampliar el procedimiento con la configuración original de hashes. Un hash válido comprueba integridad del archivo, no recuperación ni completitud de origen.

Antes de dar la recuperación por comprobada, conservar evidencia de fecha, cantidad de documentos por colección, usuarios, copia disponible, resultado de restauración y prueba de inicio de sesión. Fijar responsables y probarlo periódicamente. Eliminar una cuenta Auth sin conservar su UID impediría asociar automáticamente sus datos existentes.

## Pruebas

`npm test` comprueba identidad, cuotas, validación, fechas y exportación CSV. `npm run test:rules` necesita Java 21 y ejecuta pruebas con dos usuarios y un visitante contra el emulador de Firestore. Nunca ejecutar pruebas destructivas sobre la base real.
