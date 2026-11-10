export class ListarEquiposDeCapitan {
  constructor({ unidadDeTrabajo }) {
    this.unidadDeTrabajo = unidadDeTrabajo;
  }

  async ejecutar({ capitanId }) {
    return this.unidadDeTrabajo.ejecutar(({ equipos }) => equipos.obtenerPorCapitan(capitanId));
  }
}
