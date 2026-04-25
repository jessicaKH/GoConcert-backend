import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary()
      table.string('email', 254).nullable().unique()
      table.string('phone', 20).nullable().unique()
      table.string('full_name').notNullable().defaultTo('')
      table.string('avatar_url').nullable()
      table.string('auth_provider').notNullable() // GOOGLE | APPLE | PHONE_OTP
      table.string('provider_id').notNullable().unique()
      table.timestamp('birth_date').nullable()
      table.text('bio').nullable()
      table.string('car_model').nullable()
      table.string('push_token').nullable()
      table.string('platform', 10).nullable() // ios | android
      table.float('rating_as_driver').defaultTo(0)
      table.float('rating_as_passenger').defaultTo(0)
      table.integer('rides_as_driver_count').defaultTo(0)
      table.integer('rides_as_passenger_count').defaultTo(0)
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
