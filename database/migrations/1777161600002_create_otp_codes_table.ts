import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'otp_codes'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary()
      table.string('phone', 20).notNullable()
      table.string('code', 6).notNullable()
      table.timestamp('expires_at').notNullable()
      table.timestamp('used_at').nullable()
      table.timestamp('created_at').notNullable()
    })

    this.schema.table(this.tableName, (table) => {
      table.index(['phone'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
