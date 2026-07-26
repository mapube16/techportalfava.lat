---
phase: 03-bit-cora-diaria
plan: 07
subsystem: frontend
tags: [responsive, matchMedia, css-variables, wcag, accesibilidad, touch-targets, ios-zoom]

# Dependency graph
requires:
  - phase: 03-bit-cora-diaria
    provides: "el runner `node --import tsx --test` de 03-02 y su patrón de dependencia-del-navegador-inyectada-por-parámetro"
  - phase: 01-fundaci-n-segura-y-desplegada
    provides: "la arquitectura de frontend de 01-05: estilos inline, provider central en state.tsx, sin router"
provides:
  - "frontend/src/lib/useIsMobile.ts: ancho real vía matchMedia, con suscripción, limpieza y sin parpadeo en el primer render"
  - "El punto de ruptura (899px) escrito en TS y en CSS, con un test que impide que se separen"
  - "Los primeros tokens responsivos del frontend: --gap-page, --tap, --fs-input, --pad-brand/--pad-login/--fs-hero"
  - "Las primeras media queries del frontend (antes: cero en todo el proyecto)"
  - "Barra lateral colapsable con aria-expanded/aria-controls, Escape, cierre al tocar fuera, scroll bloqueado y foco devuelto"
  - "44px de mínimo táctil y 16px de mínimo de fuente en los primitivos de ui.tsx"
  - "--text-3 con 4.5:1 real en los dos temas, verificado en cada build por 4 casos de test"
affects: [03-05 (grilla semanal y drawer), 03-06 (cutover de Week.tsx), cualquier pantalla nueva de la app]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Media queries que cambian VARIABLES CSS; los estilos inline consumen var(--…) — un atributo `style` no admite media queries"
    - "Una sola clase estructural (.fava-aside) para lo que una variable no puede expresar (position/transform), comentada explicando por qué"
    - "El breakpoint duplicado en TS y CSS con un test que lee el CSS y compara"
    - "El contraste como test ejecutable sobre index.css, no como comentario"

key-files:
  created:
    - fava-control-tecnico/frontend/src/lib/useIsMobile.ts
    - fava-control-tecnico/frontend/src/lib/useIsMobile.test.ts
  modified:
    - fava-control-tecnico/frontend/src/index.css
    - fava-control-tecnico/frontend/src/ui.tsx
    - fava-control-tecnico/frontend/src/Layout.tsx
    - fava-control-tecnico/frontend/src/Login.tsx
    - fava-control-tecnico/frontend/src/state.tsx
    - fava-control-tecnico/frontend/src/i18n.ts
    - fava-control-tecnico/frontend/src/components/LogDayDrawer.tsx
    - fava-control-tecnico/frontend/src/screens/Projects.tsx
    - fava-control-tecnico/frontend/src/screens/Techs.tsx
    - fava-control-tecnico/frontend/src/screens/Audit.tsx
    - fava-control-tecnico/frontend/src/screens/Config.tsx
    - fava-control-tecnico/frontend/src/screens/ProjectDetail.tsx
    - fava-control-tecnico/frontend/src/screens/Kpis.tsx
    - fava-control-tecnico/frontend/package.json

key-decisions:
  - "El breakpoint vive en dos idiomas (TS y CSS) y lo que impide que se separen NO es la disciplina: un test lee index.css y compara con CONSULTA_MOVIL. Verificado por mutación que sin él la deriva queda verde"
  - "El contraste se deja como TEST, no como comentario: un comentario no se entera de que alguien retocó la paleta"
  - "--text-3 se elige por --surface-2 (fondo de `th`), no solo por --surface: la cabecera de tabla es texto de 11px en mayúsculas y es el fondo más exigente donde este color hace de texto"
  - "--sidebar-w NO se introduce pese a estar en el plan: se usaría en un solo sitio (la propia clase .fava-aside) y ahí el literal 246px se lee mejor que la indirección"
  - "El panel usa visibility además de transform: un panel solo desplazado sigue siendo tabulable y el foco se iría detrás del fondo oscurecido"
  - "Los 4 controles del encabezado (buscador, rol, idioma, tema) se declaran UNA vez y se montan en el encabezado o en el panel: dos copias se desincronizan"
  - "BIT-01 NO se marca completo: este plan es precondición de usabilidad, no el entregable"

patterns-established:
  - "Token responsivo: la media query cambia la variable, el estilo inline la consume. Evita reescribir 30 pantallas a clases"
  - "Excepción estructural documentada: cuando una variable no basta (position/transform), la clase CSS lleva el comentario de por qué existe"
  - "Medida antes que arreglo: los ratios de contraste se calcularon y se verificaron en rojo con la paleta anterior (3.12 / 2.90 / 4.19 / 3.83)"

requirements-completed: []

# Metrics
duration: 47min
completed: 2026-07-26
---

# Phase 3 Plan 7: Fundación móvil Summary

**El frontend estrena sus primeras media queries: la barra lateral de 246px (63% de un teléfono de 390px) se convierte en panel deslizante accesible, los primitivos suben a 44px táctiles y 16px de fuente, `--text-3` pasa de 3.12:1 a 4.95:1 — y el punto de ruptura y el contraste dejan de ser comentarios para ser 5 casos de test que corren en cada build.**

## Performance

- **Duration:** ~47 min
- **Started:** 2026-07-26T21:05:00Z
- **Completed:** 2026-07-26T21:52:00Z
- **Tasks:** 3 de 3 (+1 adición de alcance) — 5 commits
- **Files modified:** 16 (2 creados, 14 modificados)
- **Tests:** 35 → 49 (14 casos nuevos, 0 dependencias nuevas)

## Accomplishments

- **El toggle falso murió y las tarjetas se activan solas.** Las 6 pantallas de admin (`Projects`, `Techs`, `Audit`, `Config`, `ProjectDetail`, `Kpis`) ya tenían escrita su rama de tarjetas y era **inalcanzable** salvo por un botón de demostración que además metía la app entera dentro de un marco de teléfono dibujado de 392×768. Ese marco y el botón se fueron; las ramas no se tocaron. El diff de las 6 pantallas son **23 líneas en total**, casi todas `import` y `const movil = useIsMobile()`.
- **`index.css` pasa de 0 a 3 media queries** y el frontend estrena tokens responsivos. Ningún estilo inline se convirtió a clase: la media query cambia la variable y el `style` consume `var(--…)`.
- **La barra lateral sale del flujo en móvil** con `position: fixed` + `transform`, y vuelve a ser exactamente la de hoy por encima de 900px.
- **El contraste dejó de ser una estimación.** `--text-3` daba 3.12:1 en claro (el plan decía 3.1) y 4.19:1 en oscuro. Ahora 4.95:1 y 5.38:1, y hay 4 casos que lo recalculan desde `index.css` en cada build.
- **`Login.tsx` deja de ser inusable en un teléfono** (adición de alcance, ver más abajo).

## Task Commits

1. **Task 1 (RED): suite de la detección de ancho** — `6f269ba` (test)
2. **Task 1 (GREEN): `useIsMobile` sobre `matchMedia`** — `1ebc5f6` (feat)
3. **Task 1 (REFACTOR): jubilar el toggle falso** — `4b7d6b3` (refactor)
4. **Task 2 + adición de alcance: barra lateral colapsable, layout fluido y Login** — `5f23dbe` (feat)
5. **Task 3: objetivos táctiles, zoom de iOS y contraste** — `5c113e6` (feat)

_TDD en la Task 1: el rojo commiteado antes que el verde._

## Adición de alcance: `Login.tsx`

**Por qué el plan y los commits no cuadran:** el orquestador la añadió a mitad de ejecución, después de que el usuario probara la app en un teléfono. **No es un hallazgo mío**: es un hueco del plan 03-07, que listaba los primitivos y las pantallas de admin pero no la pantalla de acceso — la primera que ve cualquiera, incluidos los técnicos de FAVA para los que se construye toda esta fase.

Medido: `gridTemplateColumns: '1.05fr .95fr'` sin media query daba ~195px por columna a 390px, y el panel de marca gastaba **96px de esos 195 en padding** (`padding: 48`), dejando ~99px para un titular de 38px.

| | Antes (390px) | Después (390px) |
|---|---|---|
| Columnas | 2 (~195px cada una) | 1 |
| Padding del panel de marca | 48px (96 horizontales) | `--pad-brand` = 20px |
| Padding del panel de acceso | 40px | `--pad-login` = 18px |
| Titular | 38px en ~99px de ancho | `--fs-hero` = 26px en ~350px |

El panel de marca **no se oculta**: el logo del cliente sobrevive como banda superior con degradado. Por encima de 900px el diseño de dos columnas es idéntico al aprobado (los tres tokens vuelven a 48/40/38). Añadido también `paddingTop` extra solo en móvil: al bajar el padding, los botones de idioma y tema (posicionados en absoluto) caían encima del título. No se tocó ni una cadena de copy.

## Lo que hace este plan barato: el hallazgo confirmado

El plan apostaba a que las 6 pantallas de admin ya tenían layout de tarjetas escrito. **Confirmado leyendo los ficheros antes de empezar**: `if (state.mobile) { …tarjetas… }` en `Projects:34`, `Techs:132`, `Audit:25`, y ternarios de `gridTemplateColumns` en `Config:173`, `ProjectDetail:184-185`, `Kpis:239/319`. No se rediseñó nada; se cambió la fuente de la condición.

Efecto secundario que conviene saber: **la tabla de 6 columnas de KPIs nunca se pinta en móvil** (su rama móvil es de tarjetas), así que el `overflowX` que ya tenía es cosa del escritorio. Es la razón de que la sonda de desbordamiento salga limpia en esas pantallas.

## Sonda a 390px: lo verificado y lo que falta

**Verificado (ejecutable, sobre el artefacto construido `dist/assets/main-UV6N9EOD.css`):**

| Comprobación | Resultado |
|---|---|
| Bloques `@media (max-width: 899px)` en el CSS servido | 2 (tokens + `.fava-aside`) |
| `.fava-aside` con `position:fixed` en el bloque móvil | sí |
| `visibility:hidden` en el bloque móvil (foco fuera del orden de tabulación) | sí |
| `--tap: 44px` / `--fs-input: 16px` en el CSS servido | sí / sí |
| `--text-3` emitido | `#63727f` (claro) y `#8195a4` (oscuro) |

**Sonda estática de desbordamiento horizontal a 390px** (390 − 28 de `--gap-page` = **362px útiles**), pantalla por pantalla:

| Pantalla | A 390px | Nota |
|---|---|---|
| Login | OK | una columna, tokens reducidos |
| Home, Week, Notes | OK | listas en flex/`flexWrap`, sin anchos fijos |
| Projects, Techs, Audit, Config, ProjectDetail, Kpis | OK | rama de tarjetas activa por ancho real |
| Users | OK | filas con `flexWrap: 'wrap'`, `minWidth: 160/190` |
| **Inbox** | **DESBORDA** | maestro-detalle con `width: 340, flex:'none'` (`Inbox.tsx:13`) |
| Drawer de jornada | OK | ya era `maxWidth: 440` con `width: 100%` |

**Lo que NO se pudo hacer y queda para la puerta de fase:** el recorrido con navegador real. Este entorno no tiene runner de navegador ni se permite instalar uno (cero dependencias nuevas), así que la sonda de arriba es **estática y del artefacto, no de píxeles renderizados**. Los pasos exactos que un humano debe recorrer con el navegador a 390px:

1. Entrar (login con el formulario de desarrollo) → la pantalla debe ser de **una columna**, con el logo arriba y el formulario debajo, sin scroll horizontal.
2. Pulsar el botón de menú del encabezado → el panel entra deslizando sobre el contenido con fondo oscurecido.
3. Tocar fuera → cierra. Volver a abrir y pulsar **Escape** → cierra. En ambos casos el foco debe volver al botón de menú.
4. Con el panel abierto, intentar hacer scroll de la página de detrás → no debe moverse.
5. Con el panel abierto, tabular → el foco no debe irse a nada de detrás del fondo oscurecido.
6. Navegar a otra pantalla desde el panel → el panel se cierra solo.
7. Recorrer Proyectos, Técnicos, Auditoría, Configuración, KPIs y el detalle de un proyecto → **tarjetas, no tablas**, y ningún desbordamiento horizontal.
8. Enfocar un campo de texto en un iPhone real → la pantalla **no debe hacer zoom**.

El punto 8 es el único que no se puede sustituir por nada: es comportamiento de Safari sobre un dispositivo real.

## Las medidas, antes y después

**Objetivos táctiles** (todos partían por debajo de 44px; en escritorio `--tap: auto` los deja como estaban):

| Primitivo | Antes | En móvil |
|---|---|---|
| `pbtn` | ~34px | 44px |
| `gbtn` | ~32px | 44px |
| `sbtn` | ~27px | 44px |
| `ghostBtn` | ~30px | 44px |
| `ghostIconBtn` | 34×34 | 44×44 |
| `btnGhostLight` | ~34px | 44px |
| Chips de máquina del drawer | ~40px | 44px |
| Botones de concepto del drawer | ~37px | 44px |

`ghostIconBtn` lleva `min-width` **además** de `min-height`: con solo el alto habría quedado 44×34 en móvil, un rectángulo. `chip` **no** lleva `--tap` y va comentado: sus 4 usos en el repo son `<span>` de etiqueta, no controles.

**Contraste, calculado con la fórmula de WCAG 2.x y verificado en rojo con la paleta anterior:**

| Tema | Color | Sobre `--surface` | Sobre `--surface-2` (fondo de `th`) |
|---|---|---|---|
| Claro, antes | `#8494a2` | **3.12:1** ❌ | **2.90:1** ❌ |
| Claro, ahora | `#63727f` | **4.95:1** ✓ | **4.60:1** ✓ |
| Oscuro, antes | `#6f8291` | **4.19:1** ❌ | **3.83:1** ❌ |
| Oscuro, ahora | `#8195a4` | **5.38:1** ✓ | **4.91:1** ✓ |

El plan estimaba 3.1:1 para el claro y sospechaba del oscuro. Las dos cosas eran ciertas: 3.12 y 4.19. Los dos colores nuevos conservan el tono (208° y 206°) — se oscurece uno y se aclara el otro, no se cambia la familia.

Se eligieron por `--surface-2` y no solo por `--surface` porque `th` (cabecera de tabla, 11px en mayúsculas) pinta `--text-3` sobre `--surface-2`, y ese es el fondo más exigente donde este color hace de **texto**. Sobre `--surface-3` se queda en 4.20/4.30 y se deja así a propósito: esa pareja solo aparece en el icono de 64px de `Empty`, que es gráfico (umbral 3:1). Anotado en `deferred-items.md` §6.3.

## Verificaciones en rojo (los casos exactos que cayeron)

### 1. `observarMovil` sin desuscripción — `# pass 43 / # fail 1`

Cae `la limpieza se desuscribe: sin ella cada montaje deja un oyente vivo`. Es el modo de fallo real: cada montaje del layout dejaría un oyente de `matchMedia` colgado.

### 2. `esMovil` sin el guard opcional — `# pass 42 / # fail 2`

Caen `sin window devuelve false sin lanzar` y `con un window sin matchMedia devuelve false sin lanzar`. Los dos **lanzan** en vez de fallar una aserción.

### 3. Deriva del punto de ruptura: 899 → 767 solo en el TS

**Esta es la que enseña algo.** Con solo los casos de la Task 1 la mutación quedaba **verde** (`# pass 45 / # fail 0`): el caso `pregunta por el punto de ruptura` compara `CONSULTA_MOVIL` consigo mismo, o sea una tautología. Con el caso nuevo que lee `index.css`:

```
not ok 1 - index.css rompe en el mismo pixel que CONSULTA_MOVIL
# pass 44 / # fail 1
```

Sin ese caso, cambiar 899 en un solo lado deja una franja de anchos (768-899px, o sea **buena parte de las tablets**) con el layout de escritorio y las tarjetas de móvil a la vez, y nada avisa.

### 4. Contraste con la paleta anterior — `# pass 45 / # fail 4`

Los 4 casos caen y **nombran el ratio que falla**, no un booleano:

```
--text-3 sobre --surface  claro : '3.12:1 — texto normal necesita 4.5:1'
--text-3 sobre --surface-2 claro: '2.90:1 — texto normal necesita 4.5:1'
--text-3 sobre --surface  oscuro: '4.19:1 — texto normal necesita 4.5:1'
--text-3 sobre --surface-2 oscuro: '3.83:1 — texto normal necesita 4.5:1'
```

## Accesibilidad del panel: qué se implementó

| Requisito | Cómo |
|---|---|
| `aria-expanded` / `aria-controls` | En el botón de menú, apuntando a `id="fava-nav"` del `<aside>` |
| Etiqueta que cambia | `aria-label` con `menu_open`/`menu_close` (ES e IT) |
| Escape cierra | `keydown` en `document`, montado solo mientras está abierto |
| Cierre al tocar fuera | Fondo oscurecido con `onClick` |
| Cierre al navegar | `irA()` envuelve a `go()` — el panel tapa la pantalla entera |
| Foco devuelto | En la limpieza del efecto, a la `ref` del botón (al desmontar la ref ya es `null`, así que es inocuo) |
| Sin foco atrapado detrás | `visibility: hidden` además del `transform`: un panel solo desplazado sigue siendo tabulable |
| Scroll bloqueado detrás | `document.body.style.overflow`, restaurando el valor **previo**, no `''` |
| Sin animación si molesta | `@media (prefers-reduced-motion: reduce)` |

## Decisions Made

- **El breakpoint duplicado, con test que lo vigila.** CSS no puede importar un módulo TS. En vez de fingir que una convención basta, el número está en los dos sitios y hay un caso que lee el fichero CSS y compara. Verificado por mutación que sin él la deriva es invisible.
- **El contraste como test, no como comentario.** El plan pedía «dejar el ratio calculado en un comentario». Se hizo (los dos comentarios están en `index.css` con los cuatro ratios), **y además** el cálculo corre en cada build. Un comentario no se entera de que alguien retocó la paleta — que es exactamente cómo `--text-3` llegó a 3.12:1 sin que nadie lo notara.
- **`--sidebar-w` no se introduce** pese a estar en el plan: se usaría en un único sitio, la propia clase `.fava-aside`, donde el literal `246px` se lee mejor que la indirección. `--gap-page`, `--tap` y `--fs-input` sí, porque los consumen varios ficheros.
- **Una sola clase estructural**, `.fava-aside`, con el comentario de por qué existe. Todo lo demás sigue siendo inline + variables.
- **Los 4 controles del encabezado se declaran una vez** (`const controles`) y se montan en el encabezado (escritorio) o dentro del panel (móvil). Dos copias del mismo JSX se desincronizan en la siguiente edición.
- **`App.tsx` no se tocó** aunque el plan lo listaba: el árbol de `sessionStatus` y el `<div className="fava">` no necesitan nada para que los tokens funcionen. El fichero tiene 0 líneas de diff.

## Deviations from Plan

### Adición de alcance (del orquestador, no auto-decidida)

**0. `Login.tsx` entra en el plan a mitad de ejecución**

- **Origen:** el orquestador, tras una prueba del usuario en un teléfono. Documentado arriba en su propia sección.
- **Impacto:** +1 fichero, +3 tokens (`--pad-brand`, `--pad-login`, `--fs-hero`), 0 dependencias. Sin cambios por encima de 900px.

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Los objetivos táctiles del drawer del técnico se quedaban fuera del alcance del plan**

- **Found during:** Task 3
- **Issue:** El plan dice literalmente que los chips de máquina y los botones de concepto del drawer «son lo que el técnico toca con guantes — si alguno queda por debajo del mínimo tras el cambio, es un fallo del plan», pero `LogDayDrawer.tsx` no está en la lista de ficheros de ninguna tarea y no usa los primitivos de `ui.tsx`: tiene sus propios estilos inline. Medidos: chips de máquina ~40px, botones de concepto ~37px, y el campo `inp` a **15px**, por debajo del umbral de 16 de Safari.
- **Fix:** 3 valores en `LogDayDrawer.tsx`: `minHeight: 'var(--tap)'` en los dos grupos de botones y `fontSize: 'max(15px, var(--fs-input))'` en `inp` — `max()` y no `var()` a secas para no **encoger** el campo de 15 a 14px en escritorio.
- **Files modified:** `fava-control-tecnico/frontend/src/components/LogDayDrawer.tsx`
- **Verification:** build verde; los tres controles llegan a 44px en móvil y no cambian en escritorio.
- **Committed in:** `5c113e6`
- **Nota de coordinación:** 03-05 reescribe este fichero en una wave **posterior** (no simultánea), así que no hay riesgo de conflicto; si su reescritura no conserva `var(--tap)`, vuelve a bajar de 44px.

**2. [Rule 2 - Missing Critical] El caso del punto de ruptura era una tautología**

- **Found during:** Task 1, al verificar en rojo
- **Issue:** El caso `pregunta por el punto de ruptura` comprueba que `esMovil` consulta `CONSULTA_MOVIL`, o sea la constante contra sí misma. Mutando 899 → 767 la suite seguía **verde**, y esa mutación es exactamente el fallo real: CSS y TS rompiendo en píxeles distintos.
- **Fix:** caso nuevo que lee `index.css` con `readFileSync(new URL('../index.css', import.meta.url))` (independiente del `cwd`), extrae todas las media queries con `max-width` y las compara con `CONSULTA_MOVIL`.
- **Files modified:** `fava-control-tecnico/frontend/src/lib/useIsMobile.test.ts`
- **Verification:** la mutación pasa de `# fail 0` a `# fail 1` nombrando el caso.
- **Committed in:** `5f23dbe`

**3. [Rule 2 - Missing Critical] El foco podía irse a la barra lateral cerrada**

- **Found during:** Task 2
- **Issue:** Un panel escondido solo con `transform: translateX(-100%)` **sigue siendo enfocable**: sus ~10 botones de navegación siguen en el orden de tabulación, así que con el panel cerrado el tabulador se va a una barra invisible, y con el panel abierto el foco puede escaparse detrás del fondo oscurecido.
- **Fix:** `visibility: hidden` en el estado cerrado y `visible` en el abierto, con `visibility` incluida en la `transition` para que la animación de salida siga viéndose.
- **Files modified:** `fava-control-tecnico/frontend/src/index.css`
- **Verification:** presente en el CSS servido (`visibility:hidden` dentro del bloque `@media`).
- **Committed in:** `5f23dbe`

**4. [Rule 1 - Bug] Al bajar el padding, los botones de idioma y tema caían sobre el título del login**

- **Found during:** adición de alcance
- **Issue:** Están posicionados en absoluto a `top: 22, right: 24`. Con `--pad-login` a 18px y el panel ajustándose a su contenido (con el formulario de desarrollo visible el contenido puede superar la altura del panel, y `justifyContent: center` deja de centrar), se solapaban con el `<h2>`.
- **Fix:** `paddingTop: 'calc(var(--pad-login) + 44px)'` solo en móvil, reservando la altura de esa fila de botones.
- **Files modified:** `fava-control-tecnico/frontend/src/Login.tsx`
- **Committed in:** `5f23dbe`

**5. [Rule 3 - Blocking] `--tap` y `--fs-input` se definen en la Task 2, no en la Task 3**

- **Found during:** Task 2
- **Issue:** El plan pone los tres tokens en tareas distintas, lo que obliga a editar el mismo bloque `@media` dos veces y deja un commit intermedio con `var(--tap)` sin resolver (una variable inexistente hace que el navegador **descarte la declaración entera**, así que el estado intermedio no sería neutro sino incorrecto).
- **Fix:** un solo bloque `@media` con los tres tokens en la Task 2; la Task 3 solo los **consume** en `ui.tsx`. El estado final es el que pide el plan.
- **Files modified:** `fava-control-tecnico/frontend/src/index.css`
- **Committed in:** `5f23dbe` (tokens) y `5c113e6` (consumo)

### Ajustes menores

- `Layout.tsx` y `Login.tsx` se tocan también en la Task 3 (el buscador y el botón de acceso de desarrollo necesitan `--tap`), aunque la Task 3 solo listaba `ui.tsx` e `index.css`. Son ficheros de este plan.
- `pbtn`/`gbtn`/`sbtn`/`ghostBtn`/`btnGhostLight` reciben `justifyContent: 'center'` junto con `min-height`: sin él, el contenido se queda pegado arriba cuando el botón crece hasta 44px.

---

**Total deviations:** 1 adición de alcance (del orquestador) + 5 auto-fixed (3 críticos que faltaban, 1 bug, 1 de orden de tareas).
**Impact on plan:** Ninguna amplía el alcance por decisión mía salvo los 3 valores de `LogDayDrawer`, que el propio plan exige por escrito. Cero dependencias nuevas, cero ficheros de `backend/` tocados.

## Issues Encountered

- **Sin runner de navegador.** La sonda de 390px es estática y sobre el artefacto construido; el recorrido con navegador real queda documentado paso a paso arriba. El punto del zoom de iOS solo se puede cerrar en un iPhone físico.
- **Un falso negativo propio, y conviene que quede escrito:** la primera ejecución de la mutación del breakpoint dio verde y estuve a punto de anotar que el test no servía. La causa era mía — `perl -0pi -e "s/…/…/"` sin `/g` sustituyó solo la primera aparición (un comentario), dejando la constante intacta. Con `/g` la mutación se aplica de verdad y el test la caza. **Una mutación que no se comprueba que se aplicó no es una verificación en rojo.**
- **`npm run build` en la raíz: verde**, entero (`check:no-free-text` → `check:fecha-servidor` → frontend con sus 49 tests → backend con Prisma y Nest). El árbol de trabajo no tenía cambios de `backend/` en vuelo en ese momento, así que no hizo falta el plan B de construir solo el frontend.
- **Sin conflictos con planes paralelos:** no se tocó nada bajo `backend/`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **03-05 y 03-06 heredan el móvil, no lo reinventan.** Todo lo que usen de `ui.tsx` llega con 44px y 16px puestos. Lo que escriban a mano con estilos inline **no** los hereda: la regla para pantallas nuevas es `minHeight: 'var(--tap)'` en lo pulsable y `fontSize: 'var(--fs-input)'` en lo escribible, y `useIsMobile()` si necesitan ramificar el layout.
- **Aviso a 03-05:** cuando reescriba `LogDayDrawer.tsx`, sus chips de máquina y botones de concepto tienen que conservar `minHeight: 'var(--tap)'`. Sin él vuelven a 40 y 37px.
- **Aviso a quien reescriba la bandeja:** `Inbox.tsx` desborda a 390px por un panel maestro de 340px fijos. Necesita decisión de navegación, no un token — `deferred-items.md` §6.1.
- **Tres inputs de otras pantallas siguen por debajo de 16px** y provocarán zoom en iOS: `Users.tsx`, `ProjectDetail.tsx` y `ReturnModal.tsx` pisan el `fontSize` de `inputStyle` con un literal — `deferred-items.md` §6.2.
- Sin blockers.

## Trazabilidad de requisitos

- **BIT-01 → NO marcado.** Este plan es **precondición de usabilidad** («el técnico captura desde el móvil en planta»), no el entregable: la captura en sí la construyen 03-04 (endpoints) y 03-05 (grilla y drawer). Marcarlo aquí sería el falso verde que ya se corrigió dos veces en esta fase (03-02 con BIT-02/BIT-04, 01-05 con AUTH-01).

## Self-Check: PASSED

- `fava-control-tecnico/frontend/src/lib/useIsMobile.ts` — FOUND (contiene `matchMedia`, 4 apariciones)
- `fava-control-tecnico/frontend/src/lib/useIsMobile.test.ts` — FOUND
- `fava-control-tecnico/frontend/src/index.css` — FOUND (contiene `@media`, 3 apariciones)
- Commits `6f269ba`, `1ebc5f6`, `4b7d6b3`, `5f23dbe`, `5c113e6` — FOUND
- `grep -rn "state.mobile\|toggleMobile" frontend/src/` → sin resultados
- `grep -rn "view_mobile\|view_desktop" frontend/src/` → sin resultados
- `npm -w frontend run test` → `# tests 49 / # pass 49 / # fail 0`
- `npm run build` (raíz) → verde de punta a punta
- `git diff` de `package.json` / `package-lock.json` → solo la línea del script `test` (cero dependencias nuevas)

---
*Phase: 03-bit-cora-diaria*
*Completed: 2026-07-26*
