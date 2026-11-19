# Notificaciones push en el APK

La app Android (`com.zymo.intranet`) recibe avisos reales con Firebase Cloud Messaging (FCM), también con la app cerrada. Sin el archivo `google-services.json` (y sin `VITE_PUSH_FCM=1`) el APK compila y funciona igual: el registro falla, el estado queda "no disponible" y no se muestra ni el interruptor ni la oferta.

## Cómo se conecta

1. **App** (`frontend/src/lib/pushNativo.ts`): al abrir con sesión se registra en FCM, y si el aviso está activo envía el token con `POST /api/push/dispositivo` `{token, plataforma:"android", version}`. Al desactivar o cerrar sesión, `DELETE /api/push/dispositivo` `{token}`. Canal Android: `zymo_general`.
2. **Mensaje**: debe traer `data.url` (ruta interna que empiece por `/`, no por `//`) y `data.etiqueta`. Al tocar la notificación la app navega a esa ruta; cualquier otra cosa se ignora.
3. **Con la app abierta** no se muestra nada extra (la campana ya se refresca).

## Activarlo (quien administre Firebase)

1. En la consola de Firebase, crear el proyecto (sin Analytics si no se necesita).
2. Registrar una app Android con el paquete `com.zymo.intranet`.
3. Descargar `google-services.json` y copiarlo a `frontend/android/app/google-services.json`. El plugin de Google Services se aplica solo si el archivo existe (`app/build.gradle`). Además, activar `VITE_PUSH_FCM=1` en `frontend/.env.android`: sin esa variable el APK no llama a FCM (sin el JSON, el plugin cerraría la app).
4. Compilar el APK de nuevo (`npm run build:android`, `npx cap sync android`, `gradlew assembleRelease`) y distribuirlo. Los teléfonos con el APK anterior no reciben push.
5. Generar una clave de cuenta de servicio (Configuración del proyecto > Cuentas de servicio > Generar clave privada) y ponerla **solo en el servidor** como `FCM_SERVICE_ACCOUNT_FILE` (ruta al JSON) o `FCM_SERVICE_ACCOUNT_JSON`. Nunca en el repo ni en el frontend. `google-services.json` identifica la app pero no es una credencial de envío.

## Probar un envío

1. En un teléfono con el APK nuevo: iniciar sesión, activar "Avisos en este teléfono" (menú) y aceptar el permiso.
2. Verificar que el servidor guardó el token (tabla de dispositivos push).
3. Enviar con la API del servidor (o desde Firebase > Cloud Messaging > Enviar mensaje de prueba, pegando el token) un mensaje con `data: { "url": "/dashboard", "etiqueta": "prueba" }` y canal `zymo_general`.
4. Con la app cerrada debe aparecer la notificación; al tocarla abre la ruta indicada.

Si el interruptor no aparece, el teléfono no pudo registrarse en FCM (falta `google-services.json` en ese APK o no hay Google Play Services).
