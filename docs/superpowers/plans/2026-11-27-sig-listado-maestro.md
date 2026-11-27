# SIG — Listado maestro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el Excel FR-002-SIG por un listado maestro dentro del SIG que valida la codificación, la cruza con lo cargado y avisa al líder del área cuando el SIG crea, cambia o da de baja un código.

**Architecture:** Tabla nueva `SigListadoMaestro` + `SigArea.sigla` en `sig-backend`. Reglas puras en `services/listadoMaestro.ts` (validación, siguiente código, cruce, textos de aviso); router `/api/listado-maestro`; `gateLider` da lectura a líderes (su área) y a `mod_sig_subir`. Avisos con la campana existente (`services/avisosLider.ts`). Importación única con script `exceljs`. Frontend: vista nueva en el SIG de escritorio.

**Tech Stack:** Express + Prisma 5 + zod (sig-backend), exceljs, React 19 + TanStack Query + Tailwind (frontend).

**Spec:** `docs/superpowers/specs/2026-11-27-sig-listado-maestro-design.md`

## Global Constraints

- Código: `^(PRC|INS|FR|PL|PO|MA|PRG|PRT|RG)-\d{3}-[A-Z]{2,5}$`, siempre en mayúsculas y sin espacios.
- Tipos (hoja «Listas»): Procedimiento PRC, Instructivo INS, Formato FR, Plan PL, Política PO, Manual MA, Programa PRG, Protocolo PRT, Reglamento RG.
- Estados: `APROBADO`, `PENDIENTE`, `BAJA`. Disposición: «Eliminación», «Conservación total», «Almacenamiento magnético».
- Escriben: admin, gerente, `mod_sig`. Leen todo: + `mod_sig_subir`, `mod_sig_aprobar`. Líder (`mod_sig_lider`): solo lectura de sus áreas.
- Avisos solo a líderes del área: código nuevo, código cambiado, baja. La importación no avisa.
- Migraciones solo aditivas. Sin `@unique` en `codigo` (el Excel trae duplicados reales).
- Convención de pruebas del repo: self-checks `ts-node` con `assert` (sin jest/vitest), encadenados en `npm run selfcheck`.
- Sin commit ni push sin orden del usuario. Frontend: verificar con `npm run build` (no `tsc --noEmit`); tipos con `import type`.

---

### Task 1: Reglas puras del listado

**Files:**
- Create: `sig-backend/src/services/listadoMaestro.ts`
- Test: `sig-backend/scripts/listadoMaestro.selfcheck.ts` (+ encadenar en `package.json` `selfcheck`)

**Interfaces — Produces:**
```ts
export const TIPOS: readonly { tipo: string; sigla: string }[]
export const ESTADOS: readonly ["APROBADO", "PENDIENTE", "BAJA"]
export const DISPOSICIONES: readonly string[]
export function normalizarCodigo(c: string): string               // trim, mayúsculas, sin espacios internos
export function siglaDeTipo(tipo: string): string | null
export function tipoDeTexto(texto: string): string | null          // "Politica" → "Política" (sin tildes ni mayúsculas)
export function revisarCodigo(codigo: string, tipo: string): string | null   // null = válido; si no, el mensaje (400)
export type Alerta = "repetido" | "sigla_area" | "forma"
export function alertasDe(fila: { codigo: string; tipo: string; estado: string }, siglaArea: string | null, repetidos: Set<string>): Alerta[]
export function repetidosDe(filas: { codigo: string; estado: string }[]): Set<string>
export function siguienteCodigo(tipo: string, siglaArea: string | null, usados: string[]): string | null
export function codigoEnTexto(texto: string | null | undefined): string | null   // código al inicio de un nombre/archivo
export type EventoListado = { accion: "creado" | "cambiado" | "baja"; quien: string; codigo: string; codigoAnterior?: string; nombre: string; motivo?: string | null }
export function textoAvisoListado(e: EventoListado): string        // ≤ 300, sin partir emojis
```

- [ ] Escribir el self-check con: códigos válidos/ inválidos (`fr-005-pn ` → `FR-005-PN`, `PRC-1-GAD` inválido, tipo FR con código PRC → error), alertas (repetido entre áreas, BAJA no cuenta, sigla distinta), siguiente código (`FR-024-GAD` usado → `FR-025-GAD`; sin sigla → null; huecos no se rellenan), `codigoEnTexto("FR-001-GAD Registro…")`, `codigoEnTexto("fr-001-gad_registro.xlsx")`, `codigoEnTexto("Registro FR-001-GAD")` → null, textos de aviso de los tres eventos y recorte.
- [ ] Correrlo y verlo fallar (módulo inexistente).
- [ ] Implementar `listadoMaestro.ts`.
- [ ] Correrlo y verlo pasar; `npx tsc --noEmit`.

### Task 2: Esquema y migración

**Files:**
- Modify: `sig-backend/prisma/schema.prisma` (`SigArea.sigla String?`, relación `listado`, modelo `SigListadoMaestro`)
- Create: `sig-backend/prisma/migrations/20261127120000_sig_listado_maestro/migration.sql` (generada con `prisma migrate diff` desde `HEAD`)

```prisma
model SigListadoMaestro {
  id                 Int       @id @default(autoincrement())
  areaId             Int
  area               SigArea   @relation(fields: [areaId], references: [id], onDelete: Restrict)
  tipo               String    @db.VarChar(30)
  codigo             String    @db.VarChar(30)
  nombre             String    @db.VarChar(300)
  empresa            String?   @db.VarChar(60)
  version            String?   @db.VarChar(20)
  fechaCreacion      DateTime?
  fechaActualizacion DateTime?
  controlCambios     String?   @db.Text
  anosActivo         Int?
  anosInactivo       Int?
  disposicionFinal   String?   @db.VarChar(40)
  ubicacion          String?   @db.Text
  revisado           Boolean   @default(false)
  estado             String    @default("APROBADO") @db.VarChar(12)
  historial          Json      @default("[]")
  creadoPor          String?
  editadoPor         String?
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt
  @@index([areaId])
  @@index([codigo])
}
```

- [ ] Editar el esquema, generar el SQL, revisar que solo agrega (ALTER ADD COLUMN, CREATE TABLE, índices, FK).
- [ ] `prisma migrate deploy` en la BD local y `prisma generate`; `npx tsc --noEmit`.

### Task 3: API, permisos y avisos

**Files:**
- Create: `sig-backend/src/routers/listado-maestro.ts`; montar en `src/app.ts` como `/api/listado-maestro`
- Modify: `sig-backend/src/middleware/gateLider.ts` (lectura para líder y `mod_sig_subir`)
- Modify: `sig-backend/src/services/avisosLider.ts` (`crearAvisoArea` + `avisarLideresDelArea`)
- Test: ampliar `scripts/avisosLider.selfcheck.ts` (aviso por área: solo líderes de esa área, nunca el actor, sin área enlazada no avisa)

**Endpoints:**
- `GET /api/listado-maestro/areas` → `[{ id, nombre, color, sigla, total, conAlertas }]` (líder: solo las suyas).
- `GET /api/listado-maestro?areaId=N` → `{ area, filas: [{...fila, alertas, documento}], fueraDelListado, resumen, siguientes: Record<siglaTipo, string|null> }`.
- `GET /api/listado-maestro?codigo=X` → `{ codigo, filas: [...] }` (agente analista; líder: solo sus áreas).
- `POST /api/listado-maestro` · `PATCH /api/listado-maestro/:id` · `POST /api/listado-maestro/:id/baja` → `requireSigAccess`; 400 forma/tipo, 409 repetido; avisan.
- `PUT /api/listado-maestro/areas/:id/sigla` → `requireSigAccess`; `^[A-Z]{2,5}$` o null; 409 si otra área ya la usa.

**Interfaces — Produces:** `avisarLideresDelArea({ areaId: number; texto: string; actorId: number; url: string; etiqueta: string }): Promise<void>` (nunca lanza; sin `AVISOS_URL` no hace nada).

- [ ] Self-check de avisos por área (rojo → verde).
- [ ] Router + gate + montaje; `tsc`.
- [ ] Prueba contra la BD local con curl: crear, repetido (409), forma (400), cambiar código, baja, líder sin escritura (403), líder de otra área (vacío/404), aviso en la campana.

#### Contrato de la API (lo comparten la Task 3 y la Task 5 — no cambiarlo sin cambiar ambas)

Errores siempre como `{ error: string, campo?: string }` (`campo` = nombre del campo del formulario cuando aplica: `codigo`, `tipo`, `areaId`, `sigla`).

```ts
type Alerta = "repetido" | "sigla_area" | "forma"
type Documento = {                       // documento cargado en el SIG cuyo código coincide
  tipo: "procedimiento" | "instructivo" | "protocolo" | "formato" | "anexo"
  id: number; codigo: string; titulo: string
  procedimiento: { id: number; codigo: string; titulo: string; areaId: number }   // para abrirlo en el SIG
}
type HistorialItem = { fecha: string; quien: string; accion: "creado" | "cambiado" | "area" | "baja" | "reactivado" | "importado"; detalle?: string }
type FilaListado = {
  id: number; areaId: number; tipo: string; codigo: string; nombre: string
  empresa: string | null; version: string | null
  fechaCreacion: string | null; fechaActualizacion: string | null       // ISO
  controlCambios: string | null; anosActivo: number | null; anosInactivo: number | null
  disposicionFinal: string | null; ubicacion: string | null; revisado: boolean
  estado: "APROBADO" | "PENDIENTE" | "BAJA"; historial: HistorialItem[]
  creadoPor: string | null; editadoPor: string | null; createdAt: string; updatedAt: string
  alertas: Alerta[]; documento: Documento | null
}
```

- `GET /api/listado-maestro/areas` → `{ id, nombre, color, sigla: string|null, total, conAlertas }[]` (total = filas no dadas de baja; conAlertas = filas con alguna alerta). Líder: solo sus áreas.
- `GET /api/listado-maestro?areaId=N` →
  `{ area: { id, nombre, color, sigla }, filas: FilaListado[] /* por tipo y código, incluye BAJA */, fueraDelListado: Documento[], resumen: { filas, repetidos, siglaArea, forma, sinDocumento, fueraDelListado, documentosSinCodigo }, siguientes: Record<tipo, string|null> }`.
  400 sin `areaId`; 404 si no existe o el líder no es de esa área.
- `GET /api/listado-maestro?codigo=X` → `{ codigo, filas: (FilaListado & { area: { id, nombre, sigla } })[] }` (agente analista; líder: solo sus áreas).
- `POST /api/listado-maestro` body `{ areaId, tipo, codigo, nombre, empresa?, version?, fechaCreacion? /*YYYY-MM-DD|null*/, fechaActualizacion?, controlCambios?, anosActivo?, anosInactivo?, disposicionFinal?, ubicacion?, revisado?, estado?: "APROBADO"|"PENDIENTE" }` → 201 `FilaListado`. 400 forma/tipo (`campo: "codigo"|"tipo"`), 409 código repetido (`campo: "codigo"`, el mensaje dice qué fila y área lo usa), 404 área.
- `PATCH /api/listado-maestro/:id` mismos campos, todos opcionales; `estado` APROBADO|PENDIENTE reactiva una dada de baja (revisa repetido) → 200 `FilaListado`.
- `POST /api/listado-maestro/:id/baja` body `{ motivo?: string }` → 200 `FilaListado`; 409 si ya estaba de baja.
- `PUT /api/listado-maestro/areas/:id/sigla` body `{ sigla: string | null }` → 200 `{ id, sigla }`; 400 forma (`^[A-Z]{2,5}$` tras pasar a mayúsculas, `campo: "sigla"`); 409 si otra carpeta ya la usa.
- Escriben admin, gerente y `mod_sig`; el resto 403.
- Avisos (`avisarLideresDelArea`, sin esperar): POST → «creado»; PATCH con código cambiado en la misma área → «cambiado»; PATCH que cambia de área → «baja» (motivo «Pasó al área X») al área vieja y «creado» a la nueva; PATCH que reactiva → «creado»; baja → «baja». `url: /sig-area?listado=<areaId>`, `etiqueta: sig-listado-<areaId>`.
- Pantalla: `/sig?listado=<areaId>` y `/sig-area?listado=<areaId>` abren el listado con esa área elegida.

### Task 4: Importación del Excel

**Files:**
- Create: `sig-backend/scripts/importar-listado-maestro.ts` + script `importar:listado` en `package.json`
- Reutiliza las funciones puras de la Task 1 (pruebas de la normalización ya cubiertas allí; agregar las de años/empresa/estado al self-check).

- Simulacro por defecto; `--aplicar` escribe. `--mapa "Hoja=Carpeta"` para hojas cuyo nombre no coincide con una carpeta.
- Columnas por encabezado normalizado (fila 2). Filas desde la 3 con código o nombre.
- Idempotente por (área, código, nombre): una fila idéntica se omite; mismo código con otro nombre entra y queda marcada como repetida (cambio aplicado durante la ejecución: «importar las 271 filas tal como están»).
- Sigla por mayoría de sufijo; si dos áreas proponen la misma, queda vacía y se reporta. No pisa una sigla ya puesta.
- Historial de cada fila: «Importado del FR-002-SIG (hoja, fila, estado original)».
- Aserción final: conteo después = antes + insertadas; si no, falla.

- [ ] Self-check de normalizadores (años, empresa, estado, disposición).
- [ ] Simulacro con el Excel real en local; luego `--aplicar` en local con `--mapa` a carpetas de prueba; segunda corrida inserta 0.

### Task 5: Pantalla del listado maestro

**Files:**
- Create: `frontend/src/lib/sigListado.ts` (tipos y catálogos), `frontend/src/components/sig/listado/SigListadoMaestroView.tsx`, `frontend/src/components/sig/listado/FilaListadoDialog.tsx`
- Modify: `frontend/src/pages/sig/SigPage.tsx` (vista `listado`, botón en `TitleBar` para todos, `?listado=ID`)

- Selector de área con conteo y alertas; resumen (repetidos, sigla, sin documento, fuera del listado) como filtros; buscador; filtros tipo/estado.
- Tabla: código, tipo, nombre, versión, actualización, retención, disposición, estado, documento en el SIG (abre el procedimiento), alertas.
- Equipo SIG: nueva fila (con «Usar el siguiente: FR-025-GAD»), editar, dar de baja (motivo), sigla del área. Líder: sin botones de edición.
- Errores del servidor junto al campo; nada de `alert()`.

- [ ] `npm run build` limpio; lint sin errores nuevos en los archivos tocados.
- [ ] Revisión en local como admin y como líder (agent-browser).

### Task 6: Cierre

- [ ] `CLAUDE.md` del repo: sección «Listado maestro» bajo SIG.
- [ ] `npm run selfcheck` (sig-backend), `tsc` de sig-backend, `npm run build` del frontend, `docker compose build sig-backend frontend`.
- [ ] Resumen al usuario con lo pendiente para producción (correr el import en el servidor, decidir siglas en conflicto).
