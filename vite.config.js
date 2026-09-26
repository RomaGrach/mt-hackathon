import { defineConfig } from 'vite';
import { createApp } from './backend/http.js';
export default defineConfig({
  server: { host: '0.0.0.0', allowedHosts: ['terminal.local'] },
  plugins: [
    {
      name: 'game-api',
      configureServer(vite) {
        const app = createApp({ database: 'data/preview.sqlite', sweep: false });
        vite.middlewares.use((req, res, next) => {
          if (req.url.startsWith('/api/')) app.server.emit('request', req, res);
          else next();
        });
        vite.httpServer?.once('close', () => app.server.close());
      },
    },
  ],
});
