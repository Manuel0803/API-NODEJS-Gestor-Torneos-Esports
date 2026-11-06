import { UnidadDeTrabajoMemoria } from './infra/memoria/UnidadDeTrabajoMemoria.js';
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
  unidadDeTrabajo = new UnidadDeTrabajoMemoria(),
  proveedorIdentidad = new ProveedorIdentidadMemoria(),
  almacenEvidencias = new AlmacenEvidenciasMemoria(),
  notificador = new NotificadorMemoria(),
  reloj = new RelojSistema(),
  verificarDisponibilidad = async () => true,
  cerrarRecursos = async () => {}
} = {}) {
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

