import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadServerEnv } from './server/config/env.ts';
import { createApiApp } from './server/index.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseCliFlag(flag: string): string | undefined {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === flag && args[i + 1]) {
      return args[i + 1];
    }
    if (arg?.startsWith(`${flag}=`)) {
      return arg.slice(flag.length + 1);
    }
  }
  return undefined;
}

async function startServer() {
  const env = loadServerEnv();
  const app = createApiApp(env);
  const httpServer = http.createServer(app);

  const cliPort = parseCliFlag('--port');
  const cliHost = parseCliFlag('--host');
  const port = cliPort ? Number(cliPort) : env.PORT;
  const host = cliHost || '0.0.0.0';

  if (env.NODE_ENV !== 'production') {
    // Initialize Vite concurrently while binding the HTTP socket immediately
    // so early pre-warm requests to http://localhost:3000/ never hit ECONNREFUSED.
    // Attach Vite's WebSocket upgrade handler to the Express httpServer so
    // @vite/client uses the primary origin port rather than failing on port 24678
    // while keeping HMR/file-watching governed by DISABLE_HMR in vite.config.ts.
    const viteReady = import('vite').then(({ createServer: createViteServer }) =>
      createViteServer({
        server: {
          middlewareMode: true,
          allowedHosts: true,
          ws: { server: httpServer },
        },
        appType: 'spa',
      }),
    );

    app.use((req: Request, res: Response, next: NextFunction) => {
      viteReady
        .then((vite) => {
          vite.middlewares(req, res, next);
        })
        .catch(next);
    });
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  httpServer.listen(port, host, () => {
    console.log(`Festola Business Hub server listening on http://${host}:${port} (${env.APP_ENV})`);
  });
}

startServer().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown startup failure';
  console.error(`Festola server startup failed: ${message}`);
  process.exit(1);
});
