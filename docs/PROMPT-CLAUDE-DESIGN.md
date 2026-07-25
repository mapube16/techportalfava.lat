# Prompt para Claude Design — Control Técnico FAVA

> Copia y pega el bloque de abajo en Claude Design. Es autocontenido: incluye todo el contexto
> necesario para diseñar la interfaz sin acceso al repositorio.

---

Diseña la interfaz de una **aplicación web interna B2B** llamada **Control Técnico FAVA**. A continuación tienes todo el contexto; genera pantallas de alta fidelidad, un sistema de diseño coherente y los estados clave.

## 1. Qué es el producto

FAVA Latino America (filial de FAVA SpA, Italia) instala y pone en marcha **maquinaria industrial de pasta y molienda** en clientes de Latinoamérica, EE. UU. y Europa. Hoy controlan el trabajo de sus **técnicos de campo** con un Excel de 14 hojas y notas en papel. Esta app lo reemplaza con **captura única**: el técnico registra su jornada una sola vez y de ahí salen la nota semanal firmada, los KPIs y el control comercial por proyecto.

- **Usuarios:** ~30 en total (~15 técnicos). Herramienta interna, uso diario.
- **Idiomas:** español principal, con términos técnicos en italiano (Montaggio, Collaudo, Cantiere, Venduto/Eseguito). Diseña con soporte de internacionalización (es/it).
- **Dispositivos:** escritorio para Admin/Super Admin; los técnicos la usan también desde **móvil/tablet en campo** → el flujo del técnico debe ser excelente en pantalla pequeña.

## 2. Roles (un usuario puede tener varios; el permiso es la unión)

- **Técnico (T):** registra su bitácora diaria, arma y firma su nota semanal, ve solo lo suyo.
- **Administrador (A):** valida/aprueba/devuelve notas, crea y edita proyectos (con días vendidos), gestiona técnicos y usuarios, ve KPIs parciales.
- **Super Admin (S):** todo lo anterior + KPIs globales, auditoría, asignación del rol Admin y configuración.

## 3. Identidad visual y tono

- **Personalidad:** industrial, profesional, confiable, eficiente. Es una herramienta de trabajo, no una app de consumo — prioriza claridad y densidad de datos sobre lo decorativo.
- **Estética:** limpia y moderna, tipo panel de operaciones. Buen manejo de tablas densas, badges de estado y formularios largos sin que se sientan abrumadores.
- **Color:** paleta sobria con un acento industrial (sugerencia: azul acero / grafito como base, un rojo/naranja FAVA como acento para acciones y alertas). Propón la paleta con tokens (claro y oscuro).
- **Herencia italiana:** un guiño sutil a la marca FAVA SpA, sin caer en clichés.
- Incluye **modo claro y oscuro**.

## 4. Pantallas a diseñar

### Comunes
- **Login** con botón "Iniciar sesión con Microsoft" (SSO Entra ID) — pantalla mínima y sobria.
- **Shell de la app:** barra lateral con navegación según los roles del usuario, encabezado con selector de idioma, avatar/menú de usuario y (para Admin/Super) un indicador de la bandeja de aprobación en vivo.
- **Estados vacíos, de carga y de error** para las vistas principales.

### Técnico
1. **Inicio del técnico:** resumen de la semana actual (días registrados vs. pendientes), accesos rápidos a "Registrar día" y "Mi nota semanal", estado de sus últimas notas.
2. **Registrar jornada (formulario clave):** fecha, proyecto, máquina, **concepto** (catálogo: DC = día completo, DFD = festivo/dominical, DVSF = viaje salida, DVRC = viaje retorno, LR = libre remunerado, NR = no remunerado, MD = medio día, IL = incapacidad) y descripción del trabajo. Optimizado para captura rápida en móvil. Regla: **un solo registro por técnico por día**.
3. **Mi semana / Nota Semanal:** vista de los 7 días de la semana como filas, con su concepto y descripción; sección de **gastos** (descripción, fecha, valor); **captura de firma digital del cliente** (canvas de firma); botón para **generar PDF** y **enviar a revisión (submit)**.
4. **Mis notas:** lista con badges de estado (borrador, enviada, aprobada, devuelta) y comentarios del admin cuando fue devuelta.

### Administrador
5. **Bandeja de aprobación (en tiempo real):** cola de notas enviadas; abrir una nota muestra los 7 días, gastos y firma; acciones **Aprobar** y **Devolver con comentario**. Debe sentirse ágil (revisar muchas notas rápido).
6. **Proyectos:** lista + detalle. Crear/editar proyecto con: cliente, N° OA/commessa, valor de contrato y moneda, **máquinas** y **días vendidos por rol y fase** (Montaje/Colaudo) — este último es una matriz editable rol × fase.
7. **Técnicos (ABM):** lista, crear/editar, tipo de rol técnico (Mecánico, Meccatronico, Eléctrico…), interno/externo, activar/desactivar.
8. **Usuarios y roles:** invitar usuario, ver y **asignar/quitar roles** (chips multi-rol). Nota de diseño: la asignación del rol Admin solo la permite el Super Admin — refleja ese candado en la UI.
9. **KPIs (parcial):** tableros de **Vendido vs. Ejecutado vs. Delta** por proyecto/rol/fase y utilización de técnicos.

### Super Admin
10. **KPIs globales:** dashboard ejecutivo con métricas por proyecto, cliente y país.
11. **Auditoría:** tabla filtrable de eventos (actor, acción, entidad, antes/después, fecha) — densa, legible, exportable.
12. **Configuración:** catálogos y ajustes globales.

## 5. Componentes del sistema de diseño (defínelos)

- **Badges de estado** de flujo: borrador → enviada → aprobada / devuelta (colores consistentes).
- **Tablas de datos** densas con orden, filtro, paginación y acciones por fila.
- **Formularios largos** con validación en línea y guardado de borrador.
- **Matriz editable** (días vendidos rol × fase).
- **KPI cards** y gráficos de Vendido/Ejecutado/Delta y utilización (usa el patrón del skill de dataviz: paleta accesible, consistente en claro/oscuro).
- **Canvas de firma** y **previsualización de PDF**.
- **Chips de multi-rol**.
- **Toast/notificaciones** para eventos en vivo (nota aprobada, nueva nota en bandeja).

## 6. Requisitos de UX

- **Responsive real:** el flujo del técnico (registrar día, nota semanal, firma) debe funcionar perfecto en móvil; los paneles de Admin/Super pueden priorizar escritorio.
- **Accesibilidad:** contraste AA, foco visible, navegación por teclado, formularios con labels.
- **Densidad graduable:** cómodo por defecto, con opción compacta para las tablas grandes.
- **Feedback claro** en cada transición de estado (aprobar, devolver, firmar, enviar).

## 7. Entregables que quiero de ti

1. Un **sistema de diseño** breve: paleta con tokens (claro/oscuro), tipografía, escala de espaciado, y los componentes de la §5.
2. Las **pantallas de alta fidelidad** de la §4 (prioriza: login, registrar jornada móvil, nota semanal con firma, bandeja de aprobación, detalle de proyecto con días vendidos, y dashboard de KPIs).
3. Los **estados clave** de cada flujo (vacío, carga, error, y cada estado del ciclo de la nota).
4. Notas de diseño responsive para las vistas del técnico.

Genera todo con datos de ejemplo realistas (nombres de técnicos como Ivan Cortés o Leomar Klein, proyectos como "Molino Cibao Bocel — RD" o "Lucchetti Chile", máquinas CTA1000/PC4500/PL6000).
