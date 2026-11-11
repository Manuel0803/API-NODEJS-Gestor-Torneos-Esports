import { envolverAsync } from './envolverAsync.js';

export function crearControladorPartidos({ casosDeUso }) {
  return {
    reportar: envolverAsync(async (req, res) => {
      const resultado = await casosDeUso.reportarResultado.ejecutar({
        partidoId: req.params.id,
        equipoId: req.body.equipoId,
        resultado: req.body.resultado,
        evidenciaUrl: req.body.evidenciaUrl ?? null,
        usuarioSolicitanteId: req.user.sub
      });
      res.status(200).json(resultado);
    }),

    resolverDisputa: envolverAsync(async (req, res) => {
      const resultado = await casosDeUso.resolverDisputa.ejecutar({
        partidoId: req.params.id,
        arbitroId: req.user.sub,
        ganadorId: req.body.ganadorId,
        motivo: req.body.motivo
      });
      res.status(200).json({ partidoId: resultado.partidoId, estado: 'CONFIRMADO', ganadorId: resultado.ganadorId });
    }),

    anular: envolverAsync(async (req, res) => {
      const resultado = await casosDeUso.anularPartido.ejecutar({
        partidoId: req.params.id,
        arbitroId: req.user.sub,
        motivo: req.body.motivo,
        resolucion: req.body.resolucion,
        nuevoGanadorId: req.body.ganadorId
      });
      res.status(200).json({
        partidoId: resultado.partidoId,
        resolucion: resultado.resolucion,
        ganadorId: resultado.ganadorId,
        cascadaRevertida: Boolean(resultado.debeRevertirSiguiente)
      });
    })
  };
}
