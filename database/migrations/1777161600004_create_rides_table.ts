import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'rides'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary()
      table.uuid('driver_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
      table.string('event_id').notNullable().references('id').inTable('events').onDelete('CASCADE')
      table.string('direction', 10).notNullable() // OUTBOUND | RETURN
      table.float('departure_lat').notNullable()
      table.float('departure_lng').notNullable()
      table.string('departure_address').notNullable()
      table.timestamp('departure_time').notNullable()
      table.timestamp('estimated_arrival').nullable()
      table.integer('total_seats').notNullable()
      table.integer('available_seats').notNullable()
      table.float('price_per_seat').notNullable()
      table.float('min_price').notNullable()
      table.float('max_price').notNullable()
      table.jsonb('constraints').notNullable().defaultTo('[]')
      table.text('notes').nullable()
      table.string('status', 20).notNullable().defaultTo('ACTIVE') // ACTIVE | FULL | CANCELLED | COMPLETED
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
    })

    this.schema.table(this.tableName, (table) => {
      table.index(['event_id'])
      table.index(['driver_id'])
      table.index(['status'])
      table.index(['direction'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
