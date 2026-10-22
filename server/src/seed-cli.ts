import { connect, disconnect } from './db.js';
import { seedDemo } from './seed.js';

await connect();
await seedDemo();
await disconnect();
