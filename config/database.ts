import env from '#start/env'
import { defineConfig } from '@adonisjs/lucid'

const dbConfig = defineConfig({
  connection: 'pg',

  connections: {
    pg: {
      client: 'pg',
      connection: {
        connectionString: env.get('DATABASE_URL'),
        ssl: env.get('NODE_ENV') === 'production' ? { rejectUnauthorized: false } : false,
      },
      migrations: {
        naturalSort: true,
        paths: ['database/migrations'],
      },
      debug: env.get('NODE_ENV') === 'development',
    },
  },
})

export default dbConfig
