CREATE TABLE IF NOT EXISTS usuarios (
    id uuid PRIMARY KEY,
    email text NOT NULL UNIQUE,
    password_hash text NOT NULL,
    nombre_usuario text NOT NULL UNIQUE,
    gamer_tag text NOT NULL,
    rol text NOT NULL CHECK (
        rol IN (
            'ORGANIZADOR',
            'ARBITRO',
            'CAPITAN',
            'JUGADOR'
        )
    ),
    puntos_elo integer NOT NULL DEFAULT 1000,
    creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS torneos (
    id uuid PRIMARY KEY,
    nombre text NOT NULL,
    juego text NOT NULL,
    formato text NOT NULL CHECK (
        formato IN ('ELIMINACION_SIMPLE')
    ),
    cupo_maximo integer NOT NULL CHECK (cupo_maximo >= 2),
    inscriptos_actuales integer NOT NULL DEFAULT 0 CHECK (inscriptos_actuales >= 0),
    tamano_equipo integer NOT NULL CHECK (tamano_equipo >= 1),
    semilla_sorteo text NOT NULL,
    fecha_cierre_inscripcion timestamptz NOT NULL,
    inicio_checkin timestamptz NOT NULL,
    fin_checkin timestamptz NOT NULL,
    estado text NOT NULL DEFAULT 'ABIERTO' CHECK (
        estado IN (
            'ABIERTO',
            'EN_CURSO',
            'FINALIZADO',
            'CANCELADO'
        )
    ),
    CONSTRAINT torneos_cupo_no_excedido CHECK (
        inscriptos_actuales <= cupo_maximo
    ),
    CONSTRAINT torneos_ventana_checkin CHECK (fin_checkin > inicio_checkin)
);

CREATE INDEX IF NOT EXISTS idx_torneos_checkin_vencido ON torneos (fin_checkin)
WHERE
    estado = 'ABIERTO';

CREATE TABLE IF NOT EXISTS equipos (
    id uuid PRIMARY KEY,
    nombre text NOT NULL UNIQUE,
    capitan_id uuid NOT NULL REFERENCES usuarios (id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS inscripciones (
    id uuid PRIMARY KEY,
    torneo_id uuid NOT NULL REFERENCES torneos (id) ON DELETE RESTRICT,
    equipo_id uuid NOT NULL REFERENCES equipos (id) ON DELETE RESTRICT,
    checkin_confirmado boolean NOT NULL DEFAULT false,
    estado text NOT NULL DEFAULT 'CONFIRMADA' CHECK (
        estado IN ('CONFIRMADA', 'ELIMINADO_WO')
    ),
    orden_inscripcion integer NOT NULL,
    creado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT inscripciones_equipo_unico_por_torneo UNIQUE (torneo_id, equipo_id),
    CONSTRAINT inscripciones_orden_unico_por_torneo UNIQUE (torneo_id, orden_inscripcion)
);

CREATE TABLE IF NOT EXISTS inscripcion_jugadores (
    inscripcion_id uuid NOT NULL REFERENCES inscripciones (id) ON DELETE RESTRICT,
    torneo_id uuid NOT NULL REFERENCES torneos (id) ON DELETE RESTRICT,
    jugador_id uuid NOT NULL REFERENCES usuarios (id) ON DELETE RESTRICT,
    PRIMARY KEY (inscripcion_id, jugador_id),
    CONSTRAINT jugador_unico_por_torneo UNIQUE (torneo_id, jugador_id)
);

CREATE TABLE IF NOT EXISTS partidos (
    id uuid PRIMARY KEY,
    torneo_id uuid NOT NULL REFERENCES torneos (id) ON DELETE RESTRICT,
    ronda integer NOT NULL CHECK (ronda >= 1),
    posicion_en_ronda integer NOT NULL CHECK (posicion_en_ronda >= 0),
    equipo_a_id uuid REFERENCES equipos (id) ON DELETE RESTRICT,
    equipo_b_id uuid REFERENCES equipos (id) ON DELETE RESTRICT,
    es_bye boolean NOT NULL DEFAULT false,
    reporte_equipo_a text CHECK (
        reporte_equipo_a IN ('GANA_A', 'GANA_B')
    ),
    reporte_equipo_b text CHECK (
        reporte_equipo_b IN ('GANA_A', 'GANA_B')
    ),
    evidencia_a_url text,
    evidencia_b_url text,
    ganador_id uuid REFERENCES equipos (id) ON DELETE RESTRICT,
    estado text NOT NULL DEFAULT 'PENDIENTE' CHECK (
        estado IN (
            'PENDIENTE',
            'EN_JUEGO',
            'EN_DISPUTA',
            'CONFIRMADO'
        )
    ),
    siguiente_partido_id uuid REFERENCES partidos (id) ON DELETE RESTRICT,
    slot_siguiente char(1) CHECK (slot_siguiente IN ('A', 'B')),
    version integer NOT NULL DEFAULT 0,
    CONSTRAINT partidos_posicion_unica UNIQUE (
        torneo_id,
        ronda,
        posicion_en_ronda
    ),
    CONSTRAINT partidos_slot_con_siguiente CHECK (
        (siguiente_partido_id IS NULL) = (slot_siguiente IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_partidos_torneo ON partidos (torneo_id);

CREATE INDEX IF NOT EXISTS idx_partidos_siguiente ON partidos (siguiente_partido_id);

CREATE TABLE IF NOT EXISTS auditoria_arbitral (
    id uuid PRIMARY KEY,
    partido_id uuid NOT NULL REFERENCES partidos (id) ON DELETE RESTRICT,
    arbitro_id uuid NOT NULL REFERENCES usuarios (id) ON DELETE RESTRICT,
    accion text NOT NULL,
    motivo text NOT NULL,
    estado_anterior jsonb NOT NULL,
    fecha timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auditoria_partido ON auditoria_arbitral (partido_id);

CREATE TABLE IF NOT EXISTS claves_idempotencia (
    usuario_id uuid NOT NULL REFERENCES usuarios (id) ON DELETE RESTRICT,
    clave text NOT NULL,
    huella_peticion text NOT NULL,
    codigo_http integer NOT NULL,
    cuerpo_respuesta jsonb NOT NULL,
    creado_en timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (usuario_id, clave)
);