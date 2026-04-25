import { BaseModel, column } from '@adonisjs/lucid/orm'
import { DateTime } from 'luxon'

export default class OtpCode extends BaseModel {
  static selfAssignPrimaryKey = true
  static table = 'otp_codes'

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare phone: string

  @column()
  declare code: string

  @column.dateTime()
  declare expiresAt: DateTime

  @column.dateTime()
  declare usedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  get isExpired(): boolean {
    return this.expiresAt < DateTime.now()
  }

  get isUsed(): boolean {
    return this.usedAt !== null
  }
}
