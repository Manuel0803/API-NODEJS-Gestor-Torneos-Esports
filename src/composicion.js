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
import { CrearTorneo } from './dominio/casos-de-uso/CrearTorneo.js';
import { InscribirEquipo } from './dominio/casos-de-uso/InscribirEquipo.js';
import { ConfirmarCheckin } from './dominio/casos-de-uso/ConfirmarCheckin.js';
import { CerrarCheckinYArmarLlave } from './dominio/casos-de-uso/CerrarCheckinYArmarLlave.js';
import { ReportarResultado } from './dominio/casos-de-uso/ReportarResultado.js';
import { ResolverDisputa } from './dominio/casos-de-uso/ResolverDisputa.js';
import { AnularPartido } from './dominio/casos-de-uso/AnularPartido.js';

export function crearDependencias({
  env = null,
  usarMemoria = false,
  unidadDeTrabajo: unidadDeTrabajoInyectada = null,
  proveedorIdentidad = new ProveedorIdentidadMemoria(),
  almacenEvidencias = new AlmacenEvidenciasMemoria(),
  notificador = new NotificadorMemoria(),
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
    })
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
