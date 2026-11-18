# Documentación de la API HTTP — Gestor de Torneos Esports

Todas las respuestas de error siguen el estándar **RFC 9457 Problem Details (`application/problem+json`)** e incluyen el encabezado `X-Correlation-Id` propagado mediante `AsyncLocalStorage`:

```json
{
  "type": "https://api.torneos.esports/errores/no-autorizado",
  "title": "Operacion no autorizada",
  "status": 403,
  "detail": "Solo el capitan del equipo puede confirmar el check-in",
  "instance": "/torneos/550e8400-e29b-41d4-a716-446655440000/checkin",
  "correlationId": "c9a646d3-9c61-4cb7-bfcd-927512e897a6"
}
```

---

## 1. Salud y Disponibilidad (Bloque 3 y 7)

| Método | Ruta | Rol | Descripción |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | Público | Indica que el proceso Node.js está vivo y devuelve las métricas `eventLoopLagMs` (`p50Ms`, `p95Ms`, `p99Ms`, `maxMs`) medidas con `monitorEventLoopDelay`. |
| `GET` | `/ready` | Público | Verifica activamente la conexión al pool de PostgreSQL y que el esquema de tablas esté aplicado (`200 OK` o `503 Service Unavailable`). |

---

## 2. Autenticación (`/auth`)

| Método | Ruta | Rol | Descripción |
| :--- | :--- | :--- | :--- |
| `POST` | `/auth/registro` | Público | Registra un usuario nuevo hasheando la contraseña con `argon2id` (`201 Created`). |
| `POST` | `/auth/login` | Público (Rate Limited) | Verifica credenciales con `argon2id` y emite un JWT firmado con `HS256` (`sub`, `rol`, `iss`, `aud`, `exp`). |
| `GET` | `/auth/me` | Autenticado | Devuelve el perfil público del usuario autenticado según su token Bearer. |

---

## 3. Torneos, Inscripciones, Check-in y Llaves (`/torneos`)

Las operaciones `POST` soportan el encabezado `Idempotency-Key` para garantizar ejecución única ante reintentos.

| Método | Ruta | Rol | Descripción |
| :--- | :--- | :--- | :--- |
| `GET` | `/torneos` | Público | Lista todos los torneos registrados. |
| `POST` | `/torneos` | `ORGANIZADOR` | Crea un torneo nuevo en estado `ABIERTO` validando el orden cronológico de ventanas (`201 Created`). |
| `POST` | `/torneos/:id/inscripciones` | `CAPITAN` | Inscribe al equipo del capitán autenticado verificando cupo con `SELECT ... FOR UPDATE`, unicidad de jugadores y validez de `gamer_tag` en el proveedor externo. |
| `POST` | `/torneos/:id/checkin` | `CAPITAN` | Confirma la presencia del equipo dentro de la ventana `[inicioCheckin, finCheckin]`. |
| `POST` | `/torneos/:id/llave` | `ORGANIZADOR` (Rate Limited) | Cierra el check-in, elimina por W.O. (`ELIMINADO_WO`) a los ausentes y genera de forma determinista la llave de eliminación simple con asignación de *byes* a los primeros `B = P - N` preclasificados. |
| `GET` | `/torneos/:id/llave-publica` | `ESPECTADOR` (Público) | Devuelve la llave del torneo con nombres de equipos y rondas, ocultando emails, hashes, IDs de capitanes y evidencias privadas. |
| `POST` | `/torneos/simulacion-masiva` | `ORGANIZADOR` (Rate Limited) | Ejecuta la tarea pesada obligatoria del Bloque 7 (llave y calendario de 1024 participantes + recálculo de ELO de miles de jugadores) en `modo: "worker"` (`worker_threads`) o `modo: "ingenuo"` (hilo principal). |

---

## 4. Equipos y Agenda de Jugadores (`/equipos` y `/jugadores/me/agenda`)

| Método | Ruta | Rol | Descripción |
| :--- | :--- | :--- | :--- |
| `POST` | `/equipos` | `CAPITAN` | Crea un equipo asignando como `capitanId` el `sub` extraído del token JWT (`201 Created`). |
| `GET` | `/equipos` | `CAPITAN` | Lista los equipos pertenecientes al capitán autenticado. |
| `GET` | `/jugadores/me/agenda` | `JUGADOR`, `CAPITAN` | Consulta los próximos partidos pendientes o en juego en los que participa el jugador autenticado. |

---

## 5. Partidos, Doble Reporte y Arbitraje (`/partidos`)

| Método | Ruta | Rol | Descripción |
| :--- | :--- | :--- | :--- |
| `POST` | `/partidos/:id/reportes` | `CAPITAN` | Registra el reporte del capitán (`GANA_A` o `GANA_B`) y la captura de evidencia. Si ambos reportes coinciden, confirma el partido y avanza al ganador; si se contradicen, pasa a `EN_DISPUTA`. |
| `POST` | `/partidos/:id/resolver-disputa` | `ARBITRO` | Resuelve un partido `EN_DISPUTA`, registra el fallo con motivo y `estado_anterior` en `auditoria_arbitral` y avanza al ganador. |
| `POST` | `/partidos/:id/anular` | `ARBITRO` | Anula un partido confirmado (`REJUGAR` o `VICTORIA_ADMINISTRATIVA`), registra la auditoría arbitral y revierte en cascada las rondas subsiguientes siguiendo la cadena `siguiente_partido_id`. |

