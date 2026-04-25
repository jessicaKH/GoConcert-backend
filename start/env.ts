import { Env } from '@adonisjs/core/env'

export default await Env.create(new URL('../', import.meta.url), {
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  PORT: Env.schema.number(),
  HOST: Env.schema.string({ format: 'host' }),
  LOG_LEVEL: Env.schema.string(),

  APP_KEY: Env.schema.secret(),
  APP_URL: Env.schema.string({ format: 'url', tld: false }),

  SESSION_DRIVER: Env.schema.enum(['cookie', 'memory', 'database'] as const),

  // Base de données
  DATABASE_URL: Env.schema.string(),

  // Google OAuth
  GOOGLE_CLIENT_ID: Env.schema.string.optional(),
  GOOGLE_CLIENT_SECRET: Env.schema.string.optional(),

  // Apple Sign-In
  APPLE_CLIENT_ID: Env.schema.string.optional(),
  APPLE_TEAM_ID: Env.schema.string.optional(),
  APPLE_KEY_ID: Env.schema.string.optional(),
  APPLE_PRIVATE_KEY: Env.schema.string.optional(),

  // SMS OTP (Twilio)
  TWILIO_ACCOUNT_SID: Env.schema.string.optional(),
  TWILIO_AUTH_TOKEN: Env.schema.string.optional(),
  TWILIO_PHONE_NUMBER: Env.schema.string.optional(),

  // Ticketmaster / Browserless
  BROWSERLESS_URL: Env.schema.string.optional(),
  BROWSERLESS_TOKEN: Env.schema.string.optional(),
  DISCORD_WEBHOOK_URL: Env.schema.string.optional(),

  // Google Maps
  GOOGLE_MAPS_API_KEY: Env.schema.string.optional(),

  // Pricing
  COMMISSION_RATE: Env.schema.number.optional(),
  MIN_PRICE_EUR: Env.schema.number.optional(),
  MAX_PRICE_EUR: Env.schema.number.optional(),
  BASE_RATE_PER_KM: Env.schema.number.optional(),

  // Notifications Expo
  EXPO_ACCESS_TOKEN: Env.schema.string.optional(),

  // Paiement (stub)
  PAYMENT_STUB: Env.schema.boolean.optional(),
  STRIPE_SECRET_KEY: Env.schema.string.optional(),
})
