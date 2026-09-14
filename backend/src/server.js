const app = require('./app');
const env = require('./config/env');
const { testConnection } = require('./db/connection');

async function start() {
  try {
    await testConnection();
    // eslint-disable-next-line no-console
    console.log(`[db] Connected to MySQL database "${env.db.name}" at ${env.db.host}:${env.db.port}`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[db] Could not connect to MySQL. Check backend/.env and that MySQL is running.');
    // eslint-disable-next-line no-console
    console.error(`[db] ${err.message}`);
    process.exit(1);
  }

  app.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[server] Check Before Buy API listening on http://localhost:${env.port}`);
    // eslint-disable-next-line no-console
    console.log(`[server] AI product analysis: ${env.ai.apiKey ? `enabled (${env.ai.model})` : 'MOCK MODE (set AI_API_KEY)'}`);
    // eslint-disable-next-line no-console
    console.log(
      `[server] Room visualization AI: ${env.imageAi.provider ? `enabled (${env.imageAi.provider})` : 'NOT CONFIGURED (set IMAGE_AI_PROVIDER)'}`
    );
  });
}

start();
