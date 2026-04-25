import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'bookings'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary()
      table.uuid('passenger_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
      table.uuid('ride_id').notNullable().references('id').inTable('rides').onDelete('CASCADE')
      table.integer('seats_booked').notNullable().defaultTo(1)
      table.float('total_price').notNullable()
      table.float('commission').notNullable()
      table.string('status', 20).notNullable().defaultTo('PENDING') // PENDING | CONFIRMED | CANCELLED | COMPLETED
      table.string('payment_intent_id').nullable()
      table.string('payment_status', 30).notNullable().defaultTo('UNPAID') // UNPAID | PAID | REFUNDED | PARTIALLY_REFUNDED
      table.uuid('cancelled_by').nullable()
      table.timestamp('cancelled_at').nullable()
      table.text('cancel_reason').nullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
    })

    this.schema.table(this.tableName, (table) => {
      table.index(['passenger_id'])
      table.index(['ride_id'])
      table.index(['status'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
