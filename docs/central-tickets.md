# Central de tickets — Servicio al cliente

Panel de control de los casos (peticiones, quejas, reclamos y sugerencias) que los **clientes** radican en la app de autogestión. La intranet no guarda los casos: los lee y los gestiona servidor a servidor contra la API de esa app.

- Ruta en la intranet: `/servicio-cliente/central` (menú lateral → **Servicio al cliente → Central de tickets**).
- No tiene relación con «Zymo Ally · Tickets» (PQR internos): son datos y permisos distintos.

## Cómo funciona

```
Navegador ──JWT──▶ zymoally-backend  /api/central-tickets/*   (valida permiso y nivel)
                      │  X-Service-Key
                      ├──────────────▶ app de autogestión  /api/central/*   (casos, mensajes, asignaciones)
                      │  X-Internal-Key
                      └──────────────▶ backend Python  /api/tasks-v2/users y /users-por-area  (nombres y líderes)
```

- `zymoally-backend` no toca su base de datos para esto: valida la entrada, aplica las reglas por nivel y reenvía la acción con la identidad real de quien la hizo (`actor` = id, nombre y correo de la cuenta de la intranet).
- El frontend entra por el proxy que ya existía (`/zymoally-api/`): **no hubo que tocar `frontend/nginx.conf`**.
- El panel se refresca solo cada 30 segundos mientras la pestaña está a la vista.

## Permisos

El acceso es por permiso, nunca por nombre de persona. `admin` entra siempre.

| Permiso | Nivel | Qué puede hacer |
|---|---|---|
| `mod_tickets_central` | Dirección | Ve todos los casos y el panel completo. Asume, asigna, reasigna y libera. Responde al cliente y deja notas internas. Cambia severidad y área. Marca en análisis, resuelto y **cierra**. |
| `mod_tickets_central_lider` | Líder | Ve **solo** los casos asignados a su correo. Responde al cliente, deja notas internas y marca en análisis o resuelto. No asigna, no cambia severidad ni área, no cierra. |

Con los dos permisos gana Dirección. El rol `gerente` no entra solo por ser gerente.

Las reglas se aplican en el servidor (`zymoally-backend/src/services/centralAuth.ts`), no solo en la pantalla:

- Al líder se le fuerza `asignado=<su correo>` en la lista, sin importar lo que pida.
- El resumen del líder se calcula solo con sus casos: no ve totales globales.
- Un caso ajeno responde **404** al líder (no se revela que existe). Lo que no puede hacer en su propio caso responde **403**.
- Dirección solo puede asignar a personas de la lista de líderes de operaciones; el servidor toma el nombre y el correo de esa lista, no de lo que mande el navegador. Un admin puede asignar a cualquier cuenta activa.

### Dar el permiso a una persona

1. Entrar como admin a **Organización** y buscar a la persona (en su área o en «Todas las personas»).
2. **Editar permisos** → grupo «Central de tickets — Servicio al cliente» → marcar «Dirección» o «Líder (mis casos asignados)» → guardar.
3. La persona debe **cerrar sesión y volver a entrar**: el permiso viaja dentro del token.

No se le dio a nadie por defecto: lo decide un admin, persona por persona.

## Quién aparece para asignar

Cuentas **activas** cuya área (`User.area`, sin tildes ni mayúsculas) empieza por «Operaciones» (IMCC, IMCD, Logimat…). Primero quienes tienen cargo de coordinador, supervisor, director, líder o jefe en su ficha del directorio; después el resto del equipo. El área sale siempre de la cuenta; la ficha solo aporta el cargo. Si una cuenta tiene varias fichas vinculadas, no se adivina el cargo.

Para que un líder vea los casos que le asignan necesita además el permiso `mod_tickets_central_lider`.

## Flujo

1. El cliente radica el caso en su app → aparece como **Recibido** y **Sin asignar**.
2. Dirección lo **asume** (lo atiende ella misma) o lo **asigna** a un líder, con una nota opcional.
3. Quien lo tiene **responde al cliente** (el cliente lo ve en su app) o deja **notas internas** (solo equipo).
4. Se marca **En análisis** y luego **Resuelto** (el servicio exige haber respondido antes al cliente).
5. Dirección **cierra** el caso (solo si está resuelto). Un caso cerrado no recibe más mensajes.
6. Dirección puede **reasignar** o **liberar** en cualquier momento; todo queda en el historial de asignaciones.

Los plazos (acuse, primera respuesta, respuesta de fondo), el porcentaje consumido y el escalamiento los calcula la app de autogestión; la intranet solo los muestra.

## Variables de entorno

En el `.env` de la raíz (el que lee `docker-compose.yml`), para el servicio `zymoally-backend`:

| Variable | Qué es |
|---|---|
| `AUTOGESTION_API_URL` | URL base de la app de autogestión, sin barra final (p. ej. `https://pruebas.zymointranet.com`). |
| `AUTOGESTION_SERVICE_KEY` | Clave de servicio que esa app exige en `X-Service-Key`. Es un secreto: no va al repositorio ni a los registros. |

Si falta alguna, la central muestra «todavía no está conectada» (el servidor responde 503 y no llama a ningún lado). `INTERNAL_KEY` e `INTRANET_API_URL` ya existían.

## Verificación

- `cd zymoally-backend && npm run selfcheck` — sin base de datos ni red: matriz de permisos por nivel, cliente HTTP contra un servidor falso y el router completo con tokens de prueba. (El self-check de códigos PQR, que sí necesita base de datos, quedó como `npm run selfcheck:pqr`.)
- `cd backend && python -m unittest tests.test_usuarios_por_area` — lista de líderes.

## Límites conocidos

- El indicador «Sin primera respuesta» no tiene filtro en el servicio: el panel trae los 100 casos abiertos más recientes y filtra ahí. Con más de 100 abiertos avisa que la vista es parcial. El tablero también trabaja con máximo 100 casos.
- El resumen del líder se arma con sus primeros 500 casos y sus tiempos medios salen en horas de reloj (los de Dirección los entrega el servicio).
- Un permiso recién dado o quitado se nota al volver a iniciar sesión.
- No hay adjuntos ni avisos por correo desde la intranet: el panel hay que tenerlo abierto (se refresca solo).
- Si el servicio de casos no responde o rechaza la clave, el panel dice «No pudimos hablar con el servicio de casos», sin más detalle; el motivo queda en los registros de `zymoally-backend` (solo método, ruta y estado).
