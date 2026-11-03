# ADR 0001: Sistema de Módulos (ECMAScript Modules - ESM)

- **Estado:** Aceptado
- **Fecha:** 20 de Octubre de 2026
- **Participantes:** Manuel Visñuk, Franco Tofanelli

---

## Contexto

El ecosistema de Node.js utilizó CommonJS (`require` / `module.exports`), mientras que el estándar oficial del lenguaje JavaScript moderno es ECMAScript Modules (`import` / `export`). La cátedra exige elegir una única convención de módulos para todo el proyecto y prohíbe terminantemente mezclar ambas en el repositorio.

---

## Opciones Consideradas

### Opción 1: CommonJS (CJS)

- **Ventajas:**
  - Compatibilidad histórica completa con librerías antiguas.
  - Carga síncrona simple sin necesidad de especificar la extensión `.js` en rutas locales.
- **Desventajas:**
  - Formato no estándar fuera de Node.js tradicional.
  - Dificulta el análisis estático de dependencias.
  - Numerosas librerías modernas en el ecosistema de Node.js 22 se publican exclusivamente como paquetes ESM.

### Opción 2: ECMAScript Modules (ESM) nativo con `"type": "module"` (Elegida)

- **Ventajas:**
  - Estándar oficial de JavaScript moderno, soportado de forma nativa y estable en Node.js 22 LTS.
  - Sintaxis declarativa y explícita (`import` / `export`), ideal para visualizar y controlar las fronteras de dependencia de la Arquitectura Hexagonal (por ejemplo, auditar que `src/dominio/` no importe módulos de infraestructura).
  - Soporte nativo para `top-level await` e integración directa con el ejecutor de pruebas nativo `node:test`.
- **Desventajas:**
  - Requiere especificar obligatoriamente la extensión `.js` en todos los imports de archivos locales.
  - Variables globales de CJS como `__dirname` o `__filename` no existen por defecto y deben obtenerse mediante `import.meta.dirname` o `node:url`.

---

## Decisión

Se adopta **ECMAScript Modules (ESM)** configurando `"type": "module"` en `package.json` y `sourceType: "module"` en `eslint.config.js`. Todos los archivos de código fuente (`src/`) y de pruebas (`tests/`) utilizan exclusivamente `import` y `export`.

---

## Consecuencias

- **Positivas:**
  - Código alineado con el estándar moderno de JavaScript en Node.js 22 LTS.
  - Facilidad para auditar estáticamente que el dominio no importe librerías prohibidas (`express`, `pg`, etc.).
- **Negativas:**
  - Obligación estricta de incluir la extensión `.js` en cada importación relativa.

---

## Qué nos Haría Cambiar de Decisión

Un requerimiento ineludible de incorporar una dependencia crítica para el dominio que sea incompatible con ESM y no pueda cargarse mediante importación estándar en Node.js 22.
