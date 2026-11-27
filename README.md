# API Gestor de Torneos Esports — TP Final Programación IV (UTN FRRe)

Backend en Node.js 22 LTS, Express y PostgreSQL bajo Arquitectura Hexagonal para la gestión integral de torneos de videojuegos presenciales y en línea. Resuelve inscripción concurrente con cupos limitados, ventana de confirmación de presencia (*check-in*) con eliminación automática por W.O., generación determinista de llaves con descansos (*byes*), doble reporte de resultados con validación externa de identidad y evidencias (*fail-closed*), resolución de disputas y anulación arbitral con reversión en cascada.

> **Declaración de Reducción de Alcance (Sección 2.1 y 5.9):** Por tratarse de un equipo de **dos (2) integrantes**, aplica la exención oficial de implementar un segundo formato de torneo (*Round Robin*), implementándose exclusivamente **Eliminación Simple** con asignación determinista de descansos (*byes*) y manteniendo el 100% de los requisitos técnicos obligatorios de la Sección 4.

---

## 1. Requisitos y Arranque Rápido (Clon Limpio)

- **Node.js:** `>= 22.0.0` (LTS)
- **Docker y Docker Compose:** Para levantar la instancia de PostgreSQL 16.

```bash
# 1. Copiar variables de entorno (por defecto usa EXTERNAL_ADAPTER_MODE=mock)
cp .env.example .env

# 2. Levantar PostgreSQL en segundo plano
docker compose up -d

# 3. Instalar dependencias exactas
npm ci

# 4. Crear esquema de tablas y cargar los usuarios semilla para los roles
npm run setup

# 5. Iniciar el servidor en desarrollo (http://localhost:3000)
npm run dev
```

### Scripts Disponibles (`package.json`)

- `npm run dev`: Inicia el servidor en modo desarrollo con recarga automática.
- `npm start`: Inicia el servidor en modo producción.
- `npm run setup`: Ejecuta `src/infra/db/esquema.sql` y siembra los usuarios de prueba en PostgreSQL.
- `npm test`: Ejecuta la suite completa de tests automatizados (Dominio, Adaptadores Externos, HTTP, Seguridad y Concurrencia).
- `npm run lint`: Ejecuta el análisis estático con ESLint.

---

## 2. Roles del Sistema y Credenciales de Prueba (`npm run setup`)

La contraseña para todos los usuarios semilla se define en la variable `SEED_PASSWORD` del archivo `.env` (por defecto en `.env.example`: `CambiarEstaClave123!`).

| Rol | Email de Prueba | Usuario | Permisos Principales |
| :--- | :--- | :--- | :--- |
| `ORGANIZADOR` | `organizador@torneos.test` | `organizador` | Crear torneos (`POST /torneos`), cerrar check-in y armar llaves (`POST /torneos/:id/llave`) y ejecutar simulaciones masivas de 1024 equipos (`POST /torneos/simulacion-masiva`). |
| `ARBITRO` | `arbitro@torneos.test` | `arbitro` | Resolver partidos `EN_DISPUTA` (`POST /partidos/:id/resolver-disputa`) y anular partidos confirmados con reversión en cascada (`POST /partidos/:id/anular`). |
| `CAPITAN` | `capitan@torneos.test` | `capitan` | Crear equipos (`POST /equipos`), inscribir a su propio equipo (`POST /torneos/:id/inscripciones`), confirmar check-in (`POST /torneos/:id/checkin`) y reportar resultados (`POST /partidos/:id/reportes`). |
| `JUGADOR` | `jugador@torneos.test` | `jugador` | Integrar nóminas de equipos y consultar su agenda de partidos pendientes (`GET /jugadores/me/agenda`). |
| `ESPECTADOR` | *(Sin autenticación)* | — | Consultar el listado de torneos (`GET /torneos`) y la llave pública (`GET /torneos/:id/llave-publica`) sin acceso a datos personales ni evidencias privadas. |

---

## 3. Índice de Documentación Técnica (`docs/`)

### Decisiones de Arquitectura (ADRs)
1. [ADR 0001 — Sistema de Módulos (ESM Nativo vs. CommonJS)](./docs/adr/0001-sistema-de-modulos.md)
2. [ADR 0002 — Capa de Persistencia con PostgreSQL (`pg`) y Bloqueo Pesimista](./docs/adr/0002-capa-de-persistencia-postgres.md)
3. [ADR 0003 — Estrategia de Autenticación (JWT Stateless `HS256` vs. Sesiones) y Hashing `argon2id`](./docs/adr/0003-autenticacion-jwt-vs-sesiones.md)
4. [ADR 0004 — Control de Concurrencia (`SELECT ... FOR UPDATE`) e Idempotencia HTTP](./docs/adr/0004-concurrencia-bloqueo-pesimista-e-idempotencia.md)
5. [ADR 0005 — Delegación de Llave de 1024 Participantes y ELO mediante `worker_threads`](./docs/adr/0005-worker-threads-llave-1024-y-elo.md)
6. [ADR 0006 — Modelo de Punteros (`siguiente_partido_id`) para Anulación en Cascada e Integración con Servicio Externo Django](./docs/adr/0006-modelo-punteros-y-anulacion-en-cascada.md)

### Documentos de Diseño, Seguridad y Rendimiento
- [Catálogo de Endpoints HTTP y Formato RFC 9457 (`docs/api.md`)](./docs/api.md)
- [Análisis de Superficie de Ataque y Mitigaciones STRIDE (`docs/ataque.md`)](./docs/ataque.md)
- [Modelo de Dominio, Invariantes y Máquina de Estados (`docs/modelo.md`)](./docs/modelo.md)
- [Mediciones de Rendimiento y Lag del Event Loop (`docs/mediciones.md`)](./docs/mediciones.md)
