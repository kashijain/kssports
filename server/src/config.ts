import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../.env') });
dotenv.config();

export const config = {
  port: Number(process.env.PORT) || 47291,
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/lekha',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-change-me',
  exposeResetLink: process.env.EXPOSE_RESET_LINK !== 'false',
  chromePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome',
  seedDemo: process.env.SEED_DEMO === 'true',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://127.0.0.1:47291',
  isTest: process.env.NODE_ENV === 'test',
};

export const rootDir = path.resolve(here, '../..');
export const uploadsDir = path.join(rootDir, 'uploads');
export const clientDist = path.resolve(here, '../../client/dist');
