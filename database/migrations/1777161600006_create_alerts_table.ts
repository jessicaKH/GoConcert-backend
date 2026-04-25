import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'alerts'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary()
      table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
      table.string('event_id').notNullable().references('id').inTable('events').onDelete('CASCADE')
      table.float('origin_lat').notNullable()
      table.float('origin_lng').notNullable()
      table.float('radius_km').notNullable()
      table.string('direction', 10).notNullable() // OUTBOUND | RETURN
      table.boolean('is_active').notNullable().defaultTo(true)
      table.timestamp('triggered_at').nullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.unique(['user_id', 'event_id', 'direction'])
    })

    this.schema.table(this.tableName, (table) => {
      table.index(['event_id', 'direction', 'is_active'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
