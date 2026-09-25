import { createApp } from './backend/http.js';
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT должен быть от 1 до 65535');
const { server } = createApp();
server.listen(port, host, () => console.log('РЕЙС 400 · серверная игра: http://' + host + ':' + port));
let stopping = false;
function shutdown() {
  if (stopping) return; stopping = true;
  server.close(() => process.exit(0));
  setTimeout(() => { server.closeAllConnections(); process.exit(1); }, 5000).unref();
}
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);

