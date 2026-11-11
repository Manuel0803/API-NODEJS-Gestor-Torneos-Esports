import { envolverAsync } from './envolverAsync.js';

export function crearControladorEquipos({ casosDeUso }) {
  return {
    crear: envolverAsync(async (req, res) => {
      const equipo = await casosDeUso.crearEquipo.ejecutar({
        nombre: req.body.nombre,
        capitanId: req.user.sub
      });
      res.status(201).json({ id: equipo.id, nombre: equipo.nombre, capitanId: equipo.capitanId });
    }),

    listar: envolverAsync(async (req, res) => {
      const equipos = await casosDeUso.listarEquiposDeCapitan.ejecutar({ capitanId: req.user.sub });
      res.status(200).json({ equipos: equipos.map((e) => ({ id: e.id, nombre: e.nombre })) });
    }),

    agenda: envolverAsync(async (req, res) => {
      const agenda = await casosDeUso.consultarAgendaJugador.ejecutar({ jugadorId: req.user.sub });
      res.status(200).json({ agenda });
    })
  };
}
