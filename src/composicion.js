import { UnidadDeTrabajoMemoria } from './infra/memoria/UnidadDeTrabajoMemoria.js';
import { UnidadDeTrabajoPg } from './infra/db/UnidadDeTrabajoPg.js';
import {
  crearPool,
  verificarConexion,
  esquemaAplicado,
  cerrarPool
} from './infra/db/pool.js';
import { ProveedorIdentidadMemoria } from './infra/memoria/ProveedorIdentidadMemoria.js';
import { AlmacenEvidenciasMemoria } from './infra/memoria/AlmacenEvidenciasMemoria.js';
import { NotificadorMemoria } from './infra/memoria/NotificadorMemoria.js';
import { RelojSistema } from './infra/memoria/RelojSistema.js';
import { ProveedorIdentidadHttp } from './infra/externos/ProveedorIdentidadHttp.js';
import { AlmacenEvidenciasHttp } from './infra/externos/AlmacenEvidenciasHttp.js';
import { NotificadorEstructurado } from './infra/externos/NotificadorEstructurado.js';
import { CrearTorneo } from './dominio/casos-de-uso/CrearTorneo.js';
import { InscribirEquipo } from './dominio/casos-de-uso/InscribirEquipo.js';
import { ConfirmarCheckin } from './dominio/casos-de-uso/ConfirmarCheckin.js';
import { CerrarCheckinYArmarLlave } from './dominio/casos-de-uso/CerrarCheckinYArmarLlave.js';
import { ReportarResultado } from './dominio/casos-de-uso/ReportarResultado.js';
import { ResolverDisputa } from './dominio/casos-de-uso/ResolverDisputa.js';
import { AnularPartido } from './dominio/casos-de-uso/AnularPartido.js';
import { CrearEquipo } from './dominio/casos-de-uso/CrearEquipo.js';
import { ListarEquiposDeCapitan } from './dominio/casos-de-uso/ListarEquiposDeCapitan.js';
import { ConsultarAgendaJugador } from './dominio/casos-de-uso/ConsultarAgendaJugador.js';

export function crearDependencias({
  env = null,
  usarMemoria = false,
  unidadDeTrabajo: unidadDeTrabajoInyectada = null,
  proveedorIdentidad: proveedorIdentidadInyectado = null,
  almacenEvidencias: almacenEvidenciasInyectado = null,
  notificador: notificadorInyectado = null,
  reloj = new RelojSistema(),
  verificarDisponibilidad: verificarDisponibilidadInyectada = null,
  cerrarRecursos: cerrarRecursosInyectado = null
} = {}) {
  let pool = null;
  let unidadDeTrabajo = unidadDeTrabajoInyectada;

  if (!unidadDeTrabajo) {
    if (env && !usarMemoria) {
      pool = crearPool(env);
      unidadDeTrabajo = new UnidadDeTrabajoPg(pool);
    } else {
      unidadDeTrabajo = new UnidadDeTrabajoMemoria();
    }
  }

  const usarModoHttp = env?.EXTERNAL_ADAPTER_MODE === 'http';

  const proveedorIdentidad =
    proveedorIdentidadInyectado ??
    (usarModoHttp
      ? new ProveedorIdentidadHttp({
          baseUrl: env.DJANGO_SERVICE_URL,
          timeoutMs: env.DJANGO_SERVICE_TIMEOUT_MS
        })
      : new ProveedorIdentidadMemoria());

  const almacenEvidencias =
    almacenEvidenciasInyectado ??
    (usarModoHttp
      ? new AlmacenEvidenciasHttp({
          baseUrl: env.DJANGO_SERVICE_URL,
          timeoutMs: env.DJANGO_SERVICE_TIMEOUT_MS
        })
      : new AlmacenEvidenciasMemoria());

  const notificador =
    notificadorInyectado ??
    (usarModoHttp ? new NotificadorEstructurado() : new NotificadorMemoria());

  const verificarDisponibilidad =
    verificarDisponibilidadInyectada ??
    (pool
      ? async () => {
          await verificarConexion(pool);
          return esquemaAplicado(pool);
        }
      : async () => true);

  const cerrarRecursos =
    cerrarRecursosInyectado ??
    (pool
      ? async () => {
          await cerrarPool(pool);
        }
      : async () => {});

  const casosDeUso = {
    crearTorneo: new CrearTorneo({ unidadDeTrabajo, reloj }),
    inscribirEquipo: new InscribirEquipo({
      unidadDeTrabajo,
      proveedorIdentidad,
      reloj
    }),
    confirmarCheckin: new ConfirmarCheckin({ unidadDeTrabajo, reloj }),
    cerrarCheckinYArmarLlave: new CerrarCheckinYArmarLlave({
      unidadDeTrabajo,
      notificador,
      reloj
    }),
    reportarResultado: new ReportarResultado({
      unidadDeTrabajo,
      almacenEvidencias,
      notificador
    }),
    resolverDisputa: new ResolverDisputa({
      unidadDeTrabajo,
      notificador
    }),
    anularPartido: new AnularPartido({
      unidadDeTrabajo,
      notificador
    }),
    crearEquipo: new CrearEquipo({ unidadDeTrabajo }),
    listarEquiposDeCapitan: new ListarEquiposDeCapitan({ unidadDeTrabajo }),
    consultarAgendaJugador: new ConsultarAgendaJugador({ unidadDeTrabajo })
  };

  return {
    pool,
    unidadDeTrabajo,
    proveedorIdentidad,
    almacenEvidencias,
    notificador,
    reloj,
    verificarDisponibilidad,
    cerrarRecursos,
    casosDeUso
  };
}
