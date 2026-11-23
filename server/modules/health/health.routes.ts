import { Router } from 'express';
import { getSafeRuntimeSummary, type ServerEnv } from '../../config/env.ts';

export function createHealthRouter(env: ServerEnv): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.status(200).json({
      success: true,
      data: {
        status: 'ok',
        timestamp: new Date().toISOString(),
        ...getSafeRuntimeSummary(env),
      },
    });
  });

  return router;
}
