import fs from 'node:fs';
import { createApp } from './app.js';
import { config, uploadsDir } from './config.js';
import { connect } from './db.js';
import { seedDemo } from './seed.js';

fs.mkdirSync(uploadsDir, { recursive: true });

await connect();
if (config.seedDemo) {
  await seedDemo();
}
if (config.jwtSecret === 'dev-only-change-me') {
  console.warn('JWT_SECRET is still the default. Set a long random secret before sharing this server.');
}
const app = createApp();
app.listen(config.port, '0.0.0.0', () => {
  console.log(`KS Sports is running at http://127.0.0.1:${config.port}`);
});
