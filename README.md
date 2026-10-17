# API Gestor de Torneos Esports

Backend para la gestión integral de torneos de videojuegos presenciales y en línea.
Permite administrar inscripciones con cupos concurrentes, confirmación de presencia (check-in),
generación determinista de llaves de eliminación simple con descansos, doble reporte de resultados,
resolución arbitral de disputas y anulación de partidos con reversión en cascada.
Desarrollado bajo arquitectura hexagonal con Node.js 22 LTS, Express y PostgreSQL.

> **Declaración de Reducción de Alcance (Sección 1.1 y 5.9):**  
> Por ser un grupo de dos integrantes, el equipo se exime del requisito de implementar dos formatos de torneo (se descarta _Todos contra todos / Round Robin_). Se implementa únicamente **Eliminación Simple** con manejo determinista de descansos. Los requisitos comunes de la Sección 4 no se reducen en ningún caso.

---

## Requisitos Previos

- **Node.js**: `>= 22.0.0`
- **npm**: `>= 10.0.0`
- **Docker** y **Docker Compose**

---

## Comandos de Arranque y Ejecución

```bash
# 1. Clonar el repositorio e ingresar al directorio
git clone <url-del-repo>
cd API-Gestor-Torneos-Esports

# 2. Configurar variables de entorno iniciales
cp .env.example .env

# 3. Instalar dependencias exactas
npm ci

# 4. Levantar la base de datos PostgreSQL local
docker compose up -d

# 5. Ejecutar migraciones y carga inicial de datos (usuarios de prueba para los 5 roles)
npm run setup

# 6. Iniciar en modo desarrollo
npm run dev

# 7. Ejecutar la suite completa de tests (dominio, integración, seguridad y concurrencia)
npm test

# 8. Ejecutar el linter
npm run lint
```

---

## Roles y Credenciales de Prueba (Inicial)

| Rol             | Descripción              | Permisos Clave                                               |
| :-------------- | :----------------------- | :----------------------------------------------------------- |
| **ORGANIZADOR** | Administrador de torneos | Crear juegos/torneos, configurar fechas y disparar llave     |
| **ARBITRO**     | Juez de competición      | Resolver disputas y anular partidos con reversión en cascada |
| **CAPITAN**     | Líder de equipo          | Inscribir equipo, confirmar check-in y reportar resultado    |
| **JUGADOR**     | Miembro de equipo        | Consultar agenda y partidos asignados                        |
| **ESPECTADOR**  | Público general          | Consultar la llave pública (sin datos personales)            |

---

## Estructura del Proyecto

El proyecto sigue una **Arquitectura Hexagonal (Puertos y Adaptadores)**:

```text
src/
  dominio/         # Entidades puras, casos de uso, errores y puertos
  infra/           # Adaptadores de infraestructura (HTTP Express, DB PostgreSQL, Externos, Memoria, Workers)
  config/          # Esquema y validación de variables de entorno (Zod)
  composicion.js   # Único punto de unión e inyección de dependencias
  servidor.js      # Entrada HTTP, /health, /ready, SIGTERM
tests/             # Suite automatizada (dominio, integración, seguridad, concurrencia)
docs/              # ADRs, mediciones, modelo de dominio, API y auditoría
```
