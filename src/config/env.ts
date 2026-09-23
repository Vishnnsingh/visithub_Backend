import dotenv from 'dotenv';

dotenv.config();

const NODE_ENV = process.env.NODE_ENV || 'development';
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:5174';

const env = {
  NODE_ENV,
  PORT: Number(process.env.PORT) || 5000,
  APP_NAME: process.env.APP_NAME || 'Restrorent',
  API_PREFIX: process.env.API_PREFIX || '/api/v1',
  CORS_ORIGIN,

  COOKIE_SECRET: process.env.COOKIE_SECRET || 'change-this-cookie-secret',
  JWT_SECRET: process.env.JWT_SECRET || 'change-this-jwt-secret',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  SUPER_ADMIN_EMAIL: (process.env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase(),
  SUPER_ADMIN_PASSWORD: process.env.SUPER_ADMIN_PASSWORD || '',
  SUPER_ADMIN_NAME: process.env.SUPER_ADMIN_NAME || 'Super Admin',

  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  GOOGLE_CLIENT_ID: (process.env.GOOGLE_CLIENT_ID || '').trim(),

  RATE_LIMIT_WINDOW_MS: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  RATE_LIMIT_MAX: Number(process.env.RATE_LIMIT_MAX) || 100,

  UPLOAD_DIR: process.env.UPLOAD_DIR || 'uploads',
  MAX_FILE_SIZE: Number(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024,

  EXPO_ACCESS_TOKEN: process.env.EXPO_ACCESS_TOKEN || '',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',

  isDev: NODE_ENV === 'development',
  isProd: NODE_ENV === 'production',
  corsOrigins: CORS_ORIGIN.split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean),
};

export type Env = typeof env;
export default env;
