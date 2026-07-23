# techportalfava.lat

Portal web de tecnología alojado bajo el dominio **techportalfava.lat**.

> ⚠️ **Estado del proyecto:** En etapa inicial. El repositorio contiene por ahora
> la estructura base; el código de la aplicación se irá incorporando en próximas
> iteraciones.

## Descripción

`techportalfava.lat` es un proyecto web pensado como portal tecnológico. La
configuración del repositorio (ver [`.gitignore`](.gitignore)) está preparada
para un stack basado en **Node.js**, con artefactos de compilación en `dist/` y
variables de entorno gestionadas mediante archivos `.env`.

## Estructura del repositorio

| Archivo / carpeta | Descripción |
| ----------------- | ----------- |
| `README.md`       | Este documento. |
| `.gitignore`      | Reglas de exclusión (`node_modules/`, `dist/`, `.env`, `.env.*`). |

## Requisitos previos

- [Node.js](https://nodejs.org/) (versión LTS recomendada)
- npm (incluido con Node.js)

## Puesta en marcha

Los pasos a continuación son la referencia habitual para un proyecto Node.js.
Se actualizarán en cuanto se añada el código de la aplicación:

```bash
# Clonar el repositorio
git clone https://github.com/mapube16/techportalfava.lat.git
cd techportalfava.lat

# Instalar dependencias
npm install

# Ejecutar en modo desarrollo
npm run dev
```

## Variables de entorno

Las credenciales y la configuración sensible se cargan desde archivos `.env`,
que están excluidos del control de versiones. Crea tu propio `.env` local a
partir de un `.env.example` cuando esté disponible.

## Contribuciones

Este repositorio se desarrolla mediante ramas de trabajo y pull requests. Abre
una rama descriptiva para tus cambios y solicita revisión antes de fusionar a
`main`.

## Licencia

Pendiente de definir.
