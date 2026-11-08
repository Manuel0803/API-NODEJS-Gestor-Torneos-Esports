CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE usuarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    nombre_usuario VARCHAR(100) UNIQUE NOT NULL,
    gamer_tag VARCHAR(100) NOT NULL,
    rol VARCHAR(20) NOT NULL CHECK (
        rol IN (
            'ORGANIZADOR',
            'ARBITRO',
            'CAPITAN',
            'JUGADOR'
        )
    ),
    puntos_elo INT NOT NULL DEFAULT 1000,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE torneos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    nombre VARCHAR(150) NOT NULL,
    juego VARCHAR(100) NOT NULL,
    formato VARCHAR(30) NOT NULL DEFAULT 'ELIMINACION_SIMPLE',
    cupo_maximo INT NOT NULL CHECK (cupo_maximo >= 2),
    inscriptos_actuales INT NOT NULL DEFAULT 0,
    tamano_equipo INT NOT NULL CHECK (tamano_equipo >= 1),
    semilla_sorteo VARCHAR(100) NOT NULL,
    fecha_cierre_inscripcion TIMESTAMPTZ NOT NULL,
    inicio_checkin TIMESTAMPTZ NOT NULL,
    fin_checkin TIMESTAMPTZ NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'ABIERTO' CHECK (
        estado IN (
            'ABIERTO',
            'EN_CURSO',
            'FINALIZADO',
            'CANCELADO'
        )
    ),
    CONSTRAINT chk_cupo_no_excedido CHECK (
        inscriptos_actuales <= cupo_maximo
    )
);

CREATE TABLE equipos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    nombre VARCHAR(100) UNIQUE NOT NULL,
    capitan_id UUID NOT NULL REFERENCES usuarios (id)
);

CREATE TABLE inscripciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    torneo_id UUID NOT NULL REFERENCES torneos (id) ON DELETE RESTRICT,
    equipo_id UUID NOT NULL REFERENCES equipos (id),
    checkin_confirmado BOOLEAN NOT NULL DEFAULT FALSE,
    estado VARCHAR(20) NOT NULL DEFAULT 'CONFIRMADA' CHECK (
        estado IN ('CONFIRMADA', 'ELIMINADO_WO')
    ),
    orden_inscripcion INT NOT NULL,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (torneo_id, equipo_id)
);

CREATE TABLE inscripcion_jugadores (
    inscripcion_id UUID NOT NULL REFERENCES inscripciones (id) ON DELETE RESTRICT,
    torneo_id UUID NOT NULL REFERENCES torneos (id) ON DELETE RESTRICT,
    jugador_id UUID NOT NULL REFERENCES usuarios (id),
    PRIMARY KEY (inscripcion_id, jugador_id),
    UNIQUE (torneo_id, jugador_id)
);

CREATE TABLE partidos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    torneo_id UUID NOT NULL REFERENCES torneos (id) ON DELETE RESTRICT,
    ronda INT NOT NULL,
    posicion_en_ronda INT NOT NULL,
    equipo_a_id UUID REFERENCES equipos (id),
    equipo_b_id UUID REFERENCES equipos (id),
    es_bye BOOLEAN NOT NULL DEFAULT FALSE,
    reporte_equipo_a VARCHAR(10) CHECK (
        reporte_equipo_a IN ('GANA_A', 'GANA_B')
    ),
    reporte_equipo_b VARCHAR(10) CHECK (
        reporte_equipo_b IN ('GANA_A', 'GANA_B')
    ),
    evidencia_a_url TEXT,
    evidencia_b_url TEXT,
    ganador_id UUID REFERENCES equipos (id),
    estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE' CHECK (
        estado IN (
            'PENDIENTE',
            'EN_JUEGO',
            'EN_DISPUTA',
            'CONFIRMADO'
        )
    ),
    siguiente_partido_id UUID REFERENCES partidos (id),
    slot_siguiente CHAR(1) CHECK (slot_siguiente IN ('A', 'B')),
    version INT NOT NULL DEFAULT 1,
    UNIQUE (
        torneo_id,
        ronda,
        posicion_en_ronda
    ),
    CONSTRAINT chk_equipos_distintos CHECK (
        equipo_a_id IS NULL
        OR equipo_b_id IS NULL
        OR equipo_a_id <> equipo_b_id
    )
);

CREATE TABLE auditoria_arbitral (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    partido_id UUID NOT NULL REFERENCES partidos (id) ON DELETE RESTRICT,
    arbitro_id UUID NOT NULL REFERENCES usuarios (id),
    accion VARCHAR(30) NOT NULL CHECK (
        accion IN (
            'RESOLUCION_DISPUTA',
            'ANULACION_CASCADA'
        )
    ),
    motivo TEXT NOT NULL,
    estado_anterior JSONB NOT NULL,
    fecha TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE claves_idempotencia (
    usuario_id UUID NOT NULL REFERENCES usuarios (id),
    clave VARCHAR(255) NOT NULL,
    huella_peticion VARCHAR(64) NOT NULL,
    codigo_http INT NOT NULL,
    cuerpo_respuesta JSONB NOT NULL,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (usuario_id, clave)
);