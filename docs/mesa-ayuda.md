# Mesa de ayuda — solicitudes entre áreas

Mesa de ayuda **interna**: una persona le pide algo a un área, el área lo atiende y todo queda en el ticket. Reemplaza a «Zymo Ally · Tickets» (PQR), que quedó archivado: salió del menú y su API (`/api/tickets/*`) solo le responde al admin, para consultar los tickets viejos. No es la Central de tickets (`docs/central-tickets.md`), que atiende casos de **clientes**.

- Ruta: `/mesa-ayuda` (menú lateral → **Mesa de ayuda**; se abre a pantalla completa, como la Central). Entra toda cuenta activa.
- Backend: `zymoally-backend`, tablas `Mesa*` en su propia base de datos.
- Estado: funcional en local, sin desplegar. Hechas las fases 0–8 (entorno, modelo, permisos, API, pantallas, enlace con la Central, administración, tablero del líder y avisos) y la reorganización con la misma estructura de la Central. Falta desplegar.

## Flujo: Ticket → Consecutivo → Evidencia

Cada ticket recibe un consecutivo `PREFIJO-AAAA-NNNN` (ej. `IT-2026-0001`): el prefijo es del área que atiende (`MesaArea.prefijo`) y la numeración arranca en 1 cada año y por área. Lo genera `services/mesaCodigo.ts` con un advisory lock de Postgres por (prefijo, año), el mismo patrón de `pqrCode.ts`.

## Modelo (`zymoally-backend/prisma/schema.prisma`)

| Tabla | Qué guarda |
|---|---|
| `MesaArea` | Área que recibe tickets: id del área del panel admin, nombre, prefijo, si hace de Servicio al Cliente (`esSac`) y las metas que define su líder. |
| `MesaCategoria` | Categorías de solicitud, propias de cada área. |
| `MesaTicket` | El ticket: consecutivo, área destino, asunto, estado (`abierto` / `en_espera` / `cerrado`), creador, tiempos, borrado lógico y `radicadoOrigen` (caso de la Central que lo originó). |
| `MesaResponsable` | Responsables del ticket (pueden ser varios y de otras áreas). |
| `MesaMensaje` | Comentarios y notas internas (`interno`). |
| `MesaEvidencia` | Archivos adjuntos, del ticket o de un mensaje. |
| `MesaHistorial` | Cambios: creado, asignado, estado, redirigido, eliminado. |
| `MesaAviso` | Avisos de la campana: uno por persona y por evento. |
| `MesaPushSub` | Dispositivos con las notificaciones del teléfono activadas. |

Las áreas son las del panel admin de la intranet; `MesaArea` solo agrega lo que la mesa necesita. Las tablas del módulo viejo (`ZymoPqr*`) no se tocaron.

## Quién ve y quién puede hacer qué

Las reglas viven en el servidor (`services/mesaAuth.ts`), nunca solo en la pantalla. La relación con un ticket sale de los datos:

| Relación | Cómo se obtiene | Qué puede hacer |
|---|---|---|
| Creador | Radicó el ticket | Verlo, comentar, adjuntar, eliminarlo |
| Área | Su área (`User.area` o `areas_extra`) es el área destino | Lo anterior salvo eliminar, más: notas internas, asignar, cambiar estado y categoría |
| Responsable | SAC lo sumó al ticket desde otra área | Lo mismo que el área, solo en ese ticket |
| Admin | `role = admin` | Todo, y es el único que ve los eliminados |

- El área se compara sin tildes, sin mayúsculas y sin espacios de más (`normalizarArea`), igual que `usuarios_por_area.py`. Una cuenta sin área no pertenece a ninguna.
- Un ticket ajeno responde **404** (no se revela que existe). Lo que no se puede hacer en uno que sí se ve responde **403**.
- Ser `gerente` no abre tickets de otras áreas.
- Un ticket eliminado solo se puede consultar, y solo por el admin.

### Líder y Servicio al Cliente

- **Líder de área** — permiso `mod_tickets_lider` (se asigna en **Organización → Editar permisos**; la persona debe cerrar sesión y volver a entrar). Define las metas de su área, maneja sus categorías y ve su tablero. El admin no define metas.
- **Servicio al Cliente (SAC)** — no es un permiso: es pertenecer a un área marcada `esSac` en la mesa. Hoy esa área es **Planeación y Consultoria**, que tiene a su cargo SAC; el día que SAC tenga área propia en el panel admin, solo se mueve la marca. SAC puede, en los tickets con los que tiene relación (los creó o llegaron a su área): **redirigirlos** a otra área (conserva el consecutivo; se limpian categoría y responsables), **sumar responsables** de cualquier área y **enlazar** un caso de la Central de tickets (`radicadoOrigen`).

## API (`/zymoally-api/api/mesa/*`)

| Método y ruta | Qué hace | Quién |
|---|---|---|
| `GET /areas` | Áreas que reciben tickets, con sus categorías | Todos |
| `GET /areas-panel`, `PUT /areas/:areaId` | Activar un área del panel admin en la mesa (prefijo, `recibeTickets`, `esSac`) | Admin |
| `POST /areas/:areaId/categorias`, `PATCH /categorias/:id` | Categorías del área (no se borran, se desactivan) | Admin o líder del área |
| `PUT /areas/:areaId/metas` | Metas en horas laborales de primera respuesta y de cierre | Líder del área |
| `GET /areas/:areaId/tablero?dias=7\|30\|90` | Indicadores del área contra sus metas | Líder del área |
| `GET /usuarios?areaId=` | A quién se puede asignar (sin `areaId`: todas las cuentas, solo SAC y admin) | Área, SAC, admin |
| `GET /tickets?vista=mias\|area\|todas\|eliminados` | Lista con filtros (`estado`, `areaId`, `sinAsignar`, `sinRespuesta`, `asignadoAMi`, `q`) | `todas` y `eliminados`: admin |
| `GET /resumen?vista=` | Contadores de la bandeja | Igual que la lista |
| `POST /tickets` | Crear (multipart, campo `evidencias`) | Todos |
| `GET /tickets/:id` | Detalle con mensajes, evidencias, historial y `permisos` | Quien tenga relación |
| `POST /tickets/:id/mensajes` | Comentario o nota interna (`interno=true`), con evidencias | Según la tabla de arriba |
| `PATCH /tickets/:id` | Estado, categoría, prioridad, vencimiento | Quien gestiona |
| `POST /tickets/:id/responsables`, `DELETE …/:userId` | Asignar o quitar responsables | Quien gestiona; de otra área, solo SAC |
| `POST /tickets/:id/redirigir` | Pasar el ticket a otra área | SAC, admin |
| `DELETE /tickets/:id` | Eliminar con motivo (borrado lógico) | Creador, admin |
| `GET /evidencias/:id` | Descargar un adjunto | Quien vea el ticket (y la nota, si es interna) |
| `GET /serie?vista=&dias=7\|14\|30` | Cuántos tickets llegaron y se cerraron cada día, entre los que quien llama puede ver | Igual que la lista |
| `GET /panorama` | Tickets por área y estado, más el total de eliminados | Admin |
| `GET /avisos`, `POST /avisos/leer` | La campana: avisos propios y marcarlos leídos | Cada quien, los suyos |
| `GET /push`, `POST /push/suscripcion`, `DELETE /push/suscripcion` | Notificaciones del teléfono: clave pública y alta o baja de este dispositivo | Cada quien, sus dispositivos |
| `GET /yo` | Qué es quien llama (`esAdmin`, `esLider`, `esSac`, `areaIds`), para decidir qué mostrar | Todos |
| `GET /por-radicado/:radicado` | Tickets internos nacidos de un caso de la Central | Solo devuelve los que quien llama puede ver |

- Un ticket cerrado no recibe mensajes del área (409: hay que reabrirlo). Si escribe quien lo creó, se reabre solo.
- La primera respuesta pública del área fija `primeraRespuestaEn`; una nota interna no cuenta.
- Las evidencias se guardan en `uploads/mesa` y **no tienen URL pública** (`/uploads/mesa` responde 404): en el frontend hay que bajarlas con `openAuthenticatedApiBlob()`.
- Nombres y correos de personas salen siempre del backend Python, nunca del navegador.

## Pantallas (`frontend/src/pages/mesa`, `frontend/src/components/mesa`)

La mesa tiene **la misma organización que la Central de tickets**: pantalla completa (sin el menú lateral de la intranet), una cabecera con selector de secciones y tres páginas. Cambian los colores y la fuente (manual de marca); la disposición y la geometría (radios, alturas, anchos de columna) copian las de `components/central/central.css`.

| Ruta | Página | Equivale en la Central a |
|---|---|---|
| `/mesa-ayuda` | **Dashboard** (`MesaDashboard`, ver abajo). El líder ve además el tablero de su área (`MesaTablero`); el admin, el panorama entre áreas (`MesaPanorama`). | Dashboard |
| `/mesa-ayuda/solicitudes` | **Solicitudes**: lista a la izquierda (`MesaBandeja`) y el ticket a la derecha (`MesaTicket`). | Chats |
| `/mesa-ayuda/configuracion` | **Configuración** (`MesaConfig`), solo admin: áreas, prefijos, cuál hace de Servicio al Cliente y tipos de solicitud. | — |

- **Dashboard** (`MesaDashboard` + `mesa-dash.css`), con cuatro bloques sobre los tickets del área de quien mira:
  - **Franja de cifras** en una sola tarjeta: sin respuesta, sin asignar, asignados a mí, abiertos en mi área y mis solicitudes. Cada celda abre la lista ya filtrada.
  - **Pendientes de mi área**: cada ticket con una barra de cuánto lleva consumido de la meta de cierre de su área (`horasAbierto` de la lista contra `metaCierreH`), ordenados del más cerca de vencerse al más reciente; los que ya la pasaron salen como «Fuera de meta». Sin meta definida, dice «Sin meta».
  - **Por hacer**: los frentes pendientes (fuera de meta, sin respuesta, sin asignar, asignados a mí, en espera, mis solicitudes), cada uno con el botón que lleva a resolverlo. Solo aparecen los que tienen algo.
  - **Llegaron y se cerraron**: barras por día de los últimos 7, 14 o 30 días (`GET /serie`), con los totales y el detalle del día al pasar el cursor. Tiene una tabla equivalente para lectores de pantalla.
  - **Para el líder**, sus indicadores van dentro de esa misma organización (`MesaTablero.tsx` exporta las piezas; no hay una sección aparte): una segunda franja «Mi área» (primera respuesta y cierre con su medidor contra la meta, fuera de meta, llegaron, se cerraron), «Equipo» y «Qué piden» como tablas con barra en la columna principal, y «Metas del área» y «Tipos de solicitud» en la columna derecha.
- **Cabecera** (`MesaCabecera`): volver a la intranet, título, campana, Actualizar, «Nueva solicitud» y el selector Dashboard | Solicitudes (con cuántos tickets de mi área siguen sin respuesta).
- **Lista** (`MesaBandeja`): buscador, vistas (Mis solicitudes, Mi área; el admin además Todas las áreas y Eliminados) y filtros con contador. Un punto rojo marca los tickets del área sin respuesta.
- **Ticket** (`MesaTicket`), organizado como un caso de la Central:
  - Cabecera con consecutivo, estado, asunto y quién lo pidió.
  - **Conversación**: primero lo que se pidió con sus adjuntos; después las burbujas (quien pide a la izquierda, el equipo a la derecha; la nota interna va marcada «solo equipo»). El redactor queda fijo abajo, con el interruptor de nota interna, adjuntar y enviar (Ctrl + Enter).
  - **Columna de gestión** (`MesaGestion`), en tarjetas: Responsable, Avance (botones con la acción que sigue: poner en espera, reanudar, cerrar, reabrir), Clasificación, Servicio al Cliente, Datos, Historial y Eliminar. Cada tarjeta aparece solo si el servidor le permite esa acción a quien mira.
  - Con poco ancho, Conversación y Gestión son dos pestañas; en el teléfono el ticket ocupa toda la pantalla.
- **Nueva solicitud** (`MesaNueva`): área, tipo (si el área tiene categorías), asunto, descripción y evidencias. Si ya hay algo escrito, cerrar la ventana pregunta antes de descartarlo.
- La vista, el filtro y el ticket abierto viven en la URL (`/mesa-ayuda/solicitudes?vista=area&f=sinAsignar&ticket=39`).

### Tablero del líder

Indicadores de un área contra las metas que define su líder (`services/mesaTablero.ts`, función pura). Lo ve solo quien tiene `mod_tickets_lider`, y solo de sus áreas; el admin no ve tableros (su vista es el panorama entre áreas).

- **Primera respuesta** y **Cierre**: mediana en horas, la meta y el porcentaje de tickets que la cumplió. Primera respuesta mide los tickets creados en el período que ya tienen respuesta; cierre, los cerrados en el período.
- **Fuera de meta ahora**: tickets abiertos que ya pasaron la meta sin respuesta o sin cerrar.
- **Pendientes** (siempre los de ahora), **Qué piden** (por tipo de solicitud) y **Quién atiende** (abiertos y cerrados por responsable).
- Período: 7, 30 o 90 días (`?dias=`). Una meta vacía significa «sin meta»: se mide igual, pero no hay cumplimiento.
- El líder también maneja ahí las metas y los tipos de solicitud de su área.

**Horario laboral de la mesa** (`horasLaboralesMesa` en `utils/businessHours.ts`, hora Colombia): lunes a viernes de 7 a. m. a 7 p. m., sábados hasta mediodía, domingos no. Con él se miden los tiempos del tablero y el aviso de «fuera de meta». Un ticket que llega el viernes a las 6 p. m. y se responde el lunes a las 8 a. m. cuenta 7 horas. Es un solo horario para todas las áreas y no descuenta festivos. Los otros módulos de ZymoAlly conservan su regla (7 a. m. a 7 p. m. todos los días).

### Enlace con la Central de tickets

Un caso de cliente que necesita a otra área se convierte en un ticket interno sin salir de la Central:

- En el detalle del caso (página **Chats** de la Central; `components/central/CentralApoyoInterno.tsx`), el bloque **Apoyo de otras áreas** lista los tickets internos de ese caso y, a Servicio al Cliente o al admin, les muestra **Pedir apoyo a otra área…**. Abre el formulario de la mesa con el asunto y la descripción del caso, y guarda el radicado en `radicadoOrigen`.
- En el ticket, **Caso de cliente** enlaza de vuelta al caso (`RUTA_CHATS` de `CentralCabecera.tsx` + `?caso=`) para quien tenga acceso a la Central; los demás ven solo el radicado.
- El cliente nunca ve el ticket interno, y la mesa no escribe nada en la app de autogestión.
- Para pedir apoyo hacen falta las dos cosas: acceso a la Central (`mod_tickets_central` o `mod_tickets_central_lider`) y pertenecer al área marcada `esSac`.

### Avisos (campana de la intranet)

No hay correo: el objetivo es dejar de depender de Outlook. Los avisos salen en una campana en la barra superior de la intranet (`components/layout/MesaCampana.tsx`), visible desde cualquier módulo que use `PageLayout`, en escritorio y en teléfono, y en la cabecera de la propia mesa. Se refresca cada 30 s; al tocar un aviso se abre el ticket y queda leído.

La campana es una **lista corta, no un buzón** (`routers/mesa/avisos.ts`): primero los avisos sin leer, hasta 8; si hay más, un texto dice cuántos faltan en vez de llenar la ventana. Si hay menos de 5 sin leer, se completa con los últimos leídos hasta 5 filas (con todo leído, se ven los 5 últimos). «Ver la bandeja» lleva a la mesa de ayuda. Los avisos leídos hace más de 30 días se borran solos.

| Evento | A quién le llega |
|---|---|
| Ticket nuevo | A toda el área que lo atiende |
| Asignación | Solo a la persona asignada |
| Respuesta | A los responsables (o al área si no hay) y, si respondió el área, a quien lo pidió |
| Nota interna | A los responsables (o al área); nunca a quien lo pidió |
| Cierre | A los responsables y a quien lo pidió |
| Redirección | Con nombre: solo a esa persona. Sin nombre: a toda el área nueva. Y a quien lo pidió |
| Fuera de meta | A los responsables (o al área), una sola vez por cada meta |

La regla (`destinatarios()` en `services/mesaAvisos.ts`, función pura): **sin responsable, avisa a toda el área; con responsable, solo a los responsables**; quien hizo la acción nunca recibe su propio aviso.

- Servicio al Cliente puede **redirigir ya con nombre** (`responsableId` en `POST /tickets/:id/redirigir`): la persona debe ser del área destino.
- «Fuera de meta» lo revisa un cron cada 30 min entre 7 a. m. y 7 p. m., de lunes a sábado (`cron.ts` → `avisarFueraDeMeta`), con el horario laboral de la mesa.
- Crear avisos nunca tumba la acción: si falla, se registra en el log y la acción sigue.
- «Toda el área» son las cuentas cuya área principal es esa (misma limitación que la lista de asignables).
- La campana también está en la cabecera de la Central de tickets (`CentralCabecera`), que no usa la barra de la intranet.

#### Notificaciones del teléfono (Web Push)

Cada aviso de la campana se manda además como notificación a los dispositivos donde la persona lo activó; llega aunque la intranet esté cerrada, y al tocarla abre el ticket.

- **Activarlas**: en la campana, «Notificarme en este dispositivo» (pide el permiso del navegador una vez). Es por dispositivo: hay que activarlo en cada teléfono o computador. En iPhone solo funciona con la intranet instalada en la pantalla de inicio.
- **Servidor** (`services/mesaPush.ts`, librería `web-push`): necesita el par de claves `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` (y `VAPID_SUBJECT`) en el `.env` de la raíz. Se generan **una vez** con `npx web-push generate-vapid-keys`; la privada es un secreto. Sin ellas el push queda apagado y la campana sigue funcionando. Si se cambian, todos tienen que volver a activar las notificaciones.
- **Navegador** (`hooks/useMesaPush.ts` + `public/sw.js`): el service worker muestra la notificación y abre el ticket al tocarla. Un aviso nuevo del mismo ticket reemplaza al anterior.
- Las suscripciones viven en `MesaPushSub`. Si el servicio de push responde que el dispositivo ya no existe, se borra sola. En un equipo compartido, el dispositivo pasa a la cuenta que tiene la sesión.
- Exige HTTPS (en producción ya lo hay; `localhost` también sirve).

### Armonía con la Central de tickets

Las dos herramientas van a terminar siendo un solo módulo, así que comparten vocabulario y forma de usarse aunque la mesa lleve los colores del manual de marca:

| En las dos | Cómo |
|---|---|
| Filtros | Píldoras con contador; «Sin asignar» se llama igual |
| Sin primera respuesta | Central: «Sin 1ª respuesta». Mesa: filtro «Sin respuesta» (`sinRespuesta=true`, contador en `/resumen`) |
| Organización | Pantalla completa, cabecera con selector, Dashboard y lista + conversación + columna de gestión en tarjetas |
| Conversación | Quien pide a la izquierda, el equipo que atiende a la derecha; redactor fijo abajo |
| Avance | Botones con la acción que sigue, no un selector de estado |
| Nota interna | Marcada «solo equipo»; quien pide nunca la ve |
| Enviar | Ctrl + Enter |
| Estado en la URL | El caso o ticket abierto y los filtros viven en la URL |

Antes de cada fase se revisan los cambios recientes de la Central (`git fetch`) para no divergir.

## Verificación

- `cd zymoally-backend && npm run selfcheck` — sin base de datos: matriz de permisos de la mesa (`mesaAuth.selfcheck.ts`), cálculo del tablero (`mesaTablero.selfcheck.ts`), destinatarios de los avisos (`mesaAvisos.selfcheck.ts`) y permisos de la Central.
- `npm run selfcheck:mesa` — contra la base de datos: consecutivo único y sin huecos con 12 tickets creados a la vez (`mesaCodigo.selfcheck.ts`) y la API de punta a punta con personas de varias áreas (`mesaApi.selfcheck.ts`; solo simula el backend Python).

## Diseño

Solo en esta sección se aplica el Manual de Marca Zymo: rojo `#F5333F`, gris `#E2E2E2` (y gris oscuro `#575756` para estados activos y contornos) y Montserrat. El negro se usa solo en el texto, no como fondo (`frontend/src/components/mesa/mesa.css`). El resto de la intranet sigue con DM Sans.
