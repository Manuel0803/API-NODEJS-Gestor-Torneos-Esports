import express from 'express';
import helmet from 'helmet';
import cors from 'cors';

export function crearApp({
  corsOrigin = 'http://localhost:3000',
  verificarDisponibilidad = async () => true
} = {}) {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: corsOrigin }));
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.get('/ready', async (_req, res) => {
    try {
      const disponible = await verificarDisponibilidad();
      if (!disponible) {
        return res.status(503).json({ status: 'not_ready' });
      }
      return res.status(200).json({ status: 'ready' });
    } catch {
      return res.status(503).json({ status: 'not_ready' });
    }
  });

  return app;
}

