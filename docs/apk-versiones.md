# Versiones del APK Android

El APK empaqueta el código web: cada cambio de la web que dependa de él exige un APK nuevo. La app consulta `GET /api/app/version` (público, sin token) al abrirse y al volver a primer plano (máximo una vez cada 10 minutos) y compara su `versionCode` con lo que responde el servidor.

## Subir de versión

1. Compilar con propiedades de Gradle, sin editar `frontend/android/app/build.gradle`:
   `gradlew assembleRelease -PzymoVersionCode=3 -PzymoVersionName=1.2.0`
   (sin propiedades quedan `2` y `1.1.0`). El `versionCode` siempre debe crecer.
2. Alojar el APK en una dirección https accesible desde el celular.
3. En el `.env` del servidor (backend) ajustar y reiniciar solo `backend`; no hace falta recompilar la web:

| Variable | Defecto | Uso |
|---|---|---|
| `APP_ANDROID_MIN_VERSION_CODE` | `1` | Por debajo de este código la app se bloquea |
| `APP_ANDROID_LATEST_VERSION_CODE` | `2` | Por debajo (y sobre el mínimo) se sugiere actualizar |
| `APP_ANDROID_LATEST_VERSION_NAME` | `1.1.0` | Nombre que se muestra |
| `APP_ANDROID_APK_URL` | vacío | Enlace https de descarga |
| `APP_ANDROID_MENSAJE` | vacío | Texto opcional que reemplaza al de la pantalla |

Si el mínimo queda por encima del último, el servidor lo iguala al último.

## Estados en la app

- **Al día** (código instalado >= último): no se muestra nada.
- **Sugerida** (instalado < último, pero >= mínimo): banner inferior descartable; recuerda en el celular la versión descartada y no insiste con esa misma.
- **Obligatoria** (instalado < mínimo): pantalla completa que bloquea todo (también sobre el login y el bloqueo biométrico). El botón atrás solo ofrece salir. Con `APP_ANDROID_APK_URL` vacío muestra "Pide el APK actualizado al área de TI".
- Sin red o con el servidor caído no se bloquea nunca (fail-open); la consulta no cierra sesión.

## Forzar la actualización

Subir `APP_ANDROID_MIN_VERSION_CODE` al código del APK nuevo (y `LATEST_VERSION_CODE` a lo mismo o más), con `APP_ANDROID_APK_URL` apuntando al APK. Hacerlo solo cuando el APK nuevo ya esté disponible para descargar. Para revertir, bajar el mínimo.

La versión instalada se ve al pie del menú lateral móvil ("Versión 1.1.0 (2)").
