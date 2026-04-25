import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    await this.db.rawQuery('CREATE EXTENSION IF NOT EXISTS postgis;')

    await this.db.rawQuery(`
      ALTER TABLE rides
      ADD COLUMN IF NOT EXISTS departure_location GEOGRAPHY(POINT, 4326);
    `)

    await this.db.rawQuery(`
      UPDATE rides
      SET departure_location = ST_SetSRID(ST_MakePoint(departure_lng, departure_lat), 4326)::geography
      WHERE departure_location IS NULL;
    `)

    await this.db.rawQuery(`
      CREATE INDEX IF NOT EXISTS rides_departure_location_idx
      ON rides USING GIST(departure_location);
    `)
  }

  async down() {
    await this.db.rawQuery(`
      DROP INDEX IF EXISTS rides_departure_location_idx;
    `)
    await this.db.rawQuery(`
      ALTER TABLE rides DROP COLUMN IF EXISTS departure_location;
    `)
  }
}
