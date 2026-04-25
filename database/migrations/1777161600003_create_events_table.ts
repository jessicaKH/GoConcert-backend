import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'events'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.string('id').primary() // tm_xxxxxxx
      table.string('ticketmaster_id').notNullable().unique()
      table.string('name').notNullable()
      table.string('venue_name').notNullable()
      table.string('venue_address').notNullable()
      table.string('city').notNullable()
      table.string('country', 10).notNullable().defaultTo('FR')
      table.float('latitude').notNullable()
      table.float('longitude').notNullable()
      table.timestamp('starts_at').notNullable()
      table.string('image_url').nullable()
      table.string('genre').nullable()
      table.string('url').nullable()
      table.timestamp('cached_at').notNullable().defaultTo(this.now())
    })

    this.schema.table(this.tableName, (table) => {
      table.index(['city'])
      table.index(['starts_at'])
      table.index(['genre'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
