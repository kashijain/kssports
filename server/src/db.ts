import mongoose from 'mongoose';
import { config } from './config.js';

export async function connect(): Promise<typeof mongoose> {
  mongoose.set('strictQuery', true);
  return mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 8000 });
}

export async function disconnect(): Promise<void> {
  await mongoose.disconnect();
}
