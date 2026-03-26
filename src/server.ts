import http from 'http';
import { createApp } from './app';
import { connectDatabase } from './config/database';
import { initSocketServer } from './config/socket';
import { initSocketHandlers } from './sockets';
import { env } from './config/environment';
import { logger } from './utils/logger';

async function bootstrap(): Promise<void> {
  // 1. Connect to MongoDB
  await connectDatabase();

  // 2. Create Express app
  const app = createApp();

  // 3. Create HTTP server
  const httpServer = http.createServer(app);

  // 4. Initialize Socket.io
  const io = initSocketServer(httpServer);

  // 5. Register socket event handlers
  initSocketHandlers(io);

  // 6. Start listening
  httpServer.listen(env.PORT, () => {
    logger.info(`🚀 Pather Sathi backend running on port ${env.PORT}`);
    logger.info(`   Environment : ${env.NODE_ENV}`);
    logger.info(`   Frontend URL: ${env.FRONTEND_URL}`);
    logger.info(`   Demo mode   : ${env.DEMO_MODE}`);
  });

  // ── Graceful Shutdown ─────────────────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Starting graceful shutdown...`);
    httpServer.close(async () => {
      const { disconnectDatabase } = await import('./config/database');
      await disconnectDatabase();
      logger.info('Server closed. Goodbye!');
      process.exit(0);
    });
    // Force exit after 10 seconds
    setTimeout(() => process.exit(1), 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);
  });
}

bootstrap().catch((err) => {
  console.error('Fatal error during bootstrap:', err);
  process.exit(1);
});
