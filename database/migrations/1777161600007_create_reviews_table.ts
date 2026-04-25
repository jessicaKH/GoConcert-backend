import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'reviews'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary()
      table.uuid('booking_id').notNullable().unique().references('id').inTable('bookings').onDelete('CASCADE')
      table.uuid('author_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
      table.uuid('target_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
      table.string('role', 40).notNullable() // DRIVER_REVIEWING_PASSENGER | PASSENGER_REVIEWING_DRIVER
      table.integer('rating').notNullable() // 1-5
      table.text('comment').nullable()
      table.timestamp('created_at').notNullable()

      table.unique(['booking_id', 'author_id'])
    })

    this.schema.table(this.tableName, (table) => {
      table.index(['target_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
