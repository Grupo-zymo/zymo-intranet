# SIG — Listado maestro de documentos (reemplaza el Excel FR-002-SIG)

Aprobado por el usuario el 2026-11-27. Fuente analizada: `FR-002-SIG LISTADO MAESTRO.xlsx` (15 hojas por área + hoja «Listas», 271 documentos).

## Objetivo

Que el equipo SIG controle desde el módulo SIG la codificación de todos los documentos de cada área (procedimientos, instructivos, formatos, protocolos, políticas, manuales…), deje de depender del Excel y pueda **certificar que los códigos que usan los líderes son correctos**. Sirve también al agente analista (consulta por código) y a los líderes (consulta de su área).

## Hallazgos del Excel que el módulo debe atajar

- 21 códigos repetidos: Oper IMCC usa la sigla `SIG` (choca con el área SIG: `PRC-001-SIG` ×4, `FR-001…015-SIG` ×2); SAC usa `GSC` igual que Seguridad y Control; `PRC-001-GPL` en P&CL y en Desarrollo e Innovación.
- Siglas fuera del catálogo «Listas»: Talento y Cultura usa `GTC` (catálogo `TYC`), Oper LOGIMAT usa `OPD`, Gerencial tiene 2 códigos `SIG`.
- Datos sucios: `FR-005-PN ` con espacio, estado escrito de 5 formas, área y empresa escritas de varias formas, columnas en distinto orden según la hoja, retención como «2 años» o como «2».

## Decisiones del usuario

| Pregunta | Decisión |
|---|---|
| Relación con lo cargado | Registro propio + cruce automático por código |
| Datos actuales | Importar el Excel una vez (idempotente), conflictos marcados |
| Avisos al líder | Código nuevo o cambiado, y documento dado de baja |
| Exportar a Excel | Después |

## Diseño

### 1. Datos (`sig-backend`, migración aditiva)

- `SigArea.sigla String?` — sigla del área para los códigos (`GAD`, `PN`…). La edita el equipo SIG.
- Tabla nueva `SigListadoMaestro`: `areaId` (carpeta del SIG), `tipo`, `codigo` (mayúsculas, sin espacios), `nombre`, `empresa?`, `version?`, `fechaCreacion?`, `fechaActualizacion?`, `controlCambios?`, `anosActivo?`, `anosInactivo?` (enteros; null = no aplica), `disposicionFinal?`, `ubicacion?`, `revisado`, `estado` (`APROBADO` | `PENDIENTE` | `BAJA`), `historial` (Json: cambios de código y bajas con quién y cuándo), autor/editor y fechas.
- Sin `@unique` en `codigo`: el import trae duplicados reales. La unicidad se aplica en la aplicación (regla 2).
- Catálogo de tipos y siglas de tipo como constante (de la hoja «Listas»): Procedimiento `PRC`, Instructivo `INS`, Formato `FR`, Plan `PL`, Política `PO`, Manual `MA`, Programa `PRG`, Protocolo `PRT`, Reglamento `RG`.

### 2. Reglas del código (función pura + self-check)

1. Forma `SIGLA_TIPO-NNN-SIGLA_ÁREA` y sigla de tipo coherente con el tipo → si no, **no se guarda** (400).
2. No repetido entre filas no dadas de baja, en ninguna área → si no, **no se guarda** (409).
3. Sigla de área igual a la del área → si no, **se guarda con alerta**.
- Sugerencia del siguiente número libre para tipo + sigla de área.

### 3. Cruce con el SIG (en cada lectura, sin columnas nuevas en otras tablas)

- Procedimientos, instructivos y protocolos: por su campo `codigo`.
- Formatos y anexos: por el código al inicio de su nombre o del nombre del archivo.
- La lectura de un área devuelve: filas con su documento enlazado (o «sin documento»), documentos del área fuera del listado, y un resumen (repetidos, siglas que no cuadran, sin documento, fuera del listado).

### 4. Permisos y avisos

- Escriben: admin, gerente, `mod_sig`. Leen todo: además `mod_sig_subir` y `mod_sig_aprobar`. Líder de área (`mod_sig_lider`): solo lectura de sus áreas (`gateLider`).
- Avisos en la campana solo a los líderes del área (reutiliza `services/avisosLider.ts`): código nuevo, código cambiado, baja. El import no avisa.

### 5. Importación

Script `sig-backend/scripts/importar-listado-maestro.ts` con `exceljs` (ya instalado). Simulacro por defecto; carga solo con `--aplicar`. Encuentra cada columna por su encabezado (el orden cambia por hoja), asigna cada hoja a una carpeta del SIG por nombre (mapa explícito para las que no coinciden), propone la sigla de cada área por mayoría y la deja vacía si dos áreas la comparten. Idempotente por área + código; termina comparando conteos esperados contra reales.

### 6. Pantalla y agente

- SIG de escritorio: botón «Listado maestro» en la barra superior. Selector de área, resumen de alertas, tabla con buscador y filtros (tipo, estado, solo alertas); equipo SIG: nueva fila, editar, dar de baja, sigla del área. Líder: solo lectura.
- `GET /api/listado-maestro?codigo=` para el agente analista. El MCP (`mcp001-intranet`, otro repo) no se toca en este cambio.

### Fuera de alcance

Exportar a Excel FR-002-SIG, vista de celular, comparar versión del listado contra la versión cargada, herramienta MCP.
