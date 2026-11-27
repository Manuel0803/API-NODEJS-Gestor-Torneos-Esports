# Modelo de datos y máquinas de estado

Formato de torneo soportado: eliminación simple (alcance reducido declarado en el README).

## Diagrama entidad-relación

```mermaid
erDiagram
    USUARIOS ||--o{ EQUIPOS : "capitanea"
    USUARIOS ||--o{ INSCRIPCION_JUGADORES : "juega como"
    USUARIOS ||--o{ AUDITORIA_ARBITRAL : "arbitra"
    USUARIOS ||--o{ CLAVES_IDEMPOTENCIA : "posee"
    TORNEOS ||--o{ INSCRIPCIONES : "recibe"
    TORNEOS ||--o{ PARTIDOS : "contiene"
    EQUIPOS ||--o{ INSCRIPCIONES : "se inscribe"
    INSCRIPCIONES ||--o{ INSCRIPCION_JUGADORES : "nomina"
    PARTIDOS ||--o{ AUDITORIA_ARBITRAL : "es auditado"
    PARTIDOS |o--o| PARTIDOS : "siguiente_partido_id"
    EQUIPOS ||--o{ PARTIDOS : "equipo A, equipo B, ganador"

    USUARIOS {
        uuid id PK
        text email UK
        text password_hash
        text nombre_usuario UK
        text gamer_tag
        text rol
        int puntos_elo
        timestamptz creado_en
    }
    EQUIPOS {
        uuid id PK
        text nombre UK
        uuid capitan_id FK
    }
    TORNEOS {
        uuid id PK
        text nombre
        text juego
        text formato
        int cupo_maximo
        int inscriptos_actuales
        int tamano_equipo
        text semilla_sorteo
        timestamptz fecha_cierre_inscripcion
        timestamptz inicio_checkin
        timestamptz fin_checkin
        text estado
    }
    INSCRIPCIONES {
        uuid id PK
        uuid torneo_id FK
        uuid equipo_id FK
        bool checkin_confirmado
        text estado
        int orden_inscripcion
        timestamptz creado_en
    }
    INSCRIPCION_JUGADORES {
        uuid inscripcion_id PK
        uuid jugador_id PK
        uuid torneo_id FK
    }
    PARTIDOS {
        uuid id PK
        uuid torneo_id FK
        int ronda
        int posicion_en_ronda
        uuid equipo_a_id FK
        uuid equipo_b_id FK
        bool es_bye
        text reporte_equipo_a
        text reporte_equipo_b
        text evidencia_a_url
        text evidencia_b_url
        uuid ganador_id FK
        text estado
        uuid siguiente_partido_id FK
        char slot_siguiente
        int version
    }
    AUDITORIA_ARBITRAL {
        uuid id PK
        uuid partido_id FK
        uuid arbitro_id FK
        text accion
        text motivo
        jsonb estado_anterior
        timestamptz fecha
    }
    CLAVES_IDEMPOTENCIA {
        uuid usuario_id PK
        text clave PK
        text huella_peticion
        int codigo_http
        jsonb cuerpo_respuesta
        timestamptz creado_en
    }
```

## Invariantes garantizadas por la base de datos

| Invariante | Mecanismo |
| --- | --- |
| Nunca hay más inscriptos que cupos | `CHECK inscriptos_actuales <= cupo_maximo` y `SELECT ... FOR UPDATE` sobre el torneo |
| Un equipo se inscribe una sola vez por torneo | `UNIQUE (torneo_id, equipo_id)` |
| Un jugador juega en un solo equipo por torneo | `UNIQUE (torneo_id, jugador_id)` en `inscripcion_jugadores` |
| El orden de inscripción no se repite | `UNIQUE (torneo_id, orden_inscripcion)` |
| Un lugar de la llave es único | `UNIQUE (torneo_id, ronda, posicion_en_ronda)` |
| El puntero al siguiente partido está completo o ausente | `CHECK ((siguiente_partido_id IS NULL) = (slot_siguiente IS NULL))` |
| Estados y reportes válidos | `CHECK` sobre `estado`, `rol`, `reporte_equipo_*`, `slot_siguiente` |
| La ventana de check-in es coherente | `CHECK fin_checkin > inicio_checkin` |
| No se borra información referenciada | `ON DELETE RESTRICT` en todas las claves foráneas |
| Una clave de idempotencia es única por usuario | `PRIMARY KEY (usuario_id, clave)` |

Las operaciones de escritura sobre torneo y partidos se hacen dentro de una transacción con bloqueo pesimista; el orden de bloqueo es partidos de menor a mayor ronda y luego torneo (ADR 0002 y ADR 0004). La columna `version` de `partidos` se incrementa en cada modificación.

## Máquina de estados del torneo

```mermaid
stateDiagram-v2
    [*] --> ABIERTO
    ABIERTO --> EN_CURSO : cerrar check-in y armar llave
    ABIERTO --> CANCELADO : cancelar
    EN_CURSO --> FINALIZADO : final confirmada
    CANCELADO --> [*]
    FINALIZADO --> [*]
```

- Solo `ABIERTO` acepta inscripciones y check-in.
- Solo `ABIERTO` puede iniciarse o cancelarse.
- Solo `EN_CURSO` puede finalizarse, y exige que el partido final esté `CONFIRMADO` con ganador.

## Máquina de estados del partido

```mermaid
stateDiagram-v2
    [*] --> PENDIENTE
    PENDIENTE --> CONFIRMADO : resolver Bye
    PENDIENTE --> EN_JUEGO : ambos equipos asignados
    EN_JUEGO --> CONFIRMADO : reportes coincidentes
    EN_JUEGO --> CONFIRMADO : victoria por W.O.
    EN_JUEGO --> EN_DISPUTA : reportes contradictorios
    EN_DISPUTA --> CONFIRMADO : resolución arbitral
    EN_DISPUTA --> EN_JUEGO : anulación con repetición
    CONFIRMADO --> EN_JUEGO : anulación con repetición
    CONFIRMADO --> CONFIRMADO : anulación con otro ganador
    CONFIRMADO --> PENDIENTE : anulación en cascada del partido siguiente
    CONFIRMADO --> [*]
```

- `registrarReporte` solo se acepta en `EN_JUEGO`; `resolverDisputaArbitral` solo en `EN_DISPUTA`.
- Las anulaciones (`CONFIRMADO` o `EN_DISPUTA`) las hace un árbitro con motivo obligatorio y dejan una fila en `auditoria_arbitral` con el estado anterior.
- Un Bye no se puede anular.
- Si la anulación cambia el ganador, el partido siguiente vuelve a `PENDIENTE` y la reversión se propaga en cascada hacia la final (ADR 0006).
- Cualquier transición fuera de este diagrama lanza `PartidoNoModificableError`.

## Máquina de estados de la inscripción

```mermaid
stateDiagram-v2
    [*] --> CONFIRMADA : inscribir equipo
    CONFIRMADA --> CONFIRMADA : check-in confirmado
    CONFIRMADA --> ELIMINADO_WO : ventana de check-in vencida sin confirmar
    ELIMINADO_WO --> [*]
```

Una inscripción `ELIMINADO_WO` no puede tener `checkin_confirmado = true`. Los equipos eliminados por W.O. no entran a la llave y liberan su lugar con Byes.
