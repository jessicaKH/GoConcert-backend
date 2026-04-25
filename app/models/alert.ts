import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { DateTime } from 'luxon'
import User from '#models/user'
import Event from '#models/event'
import type { RideDirection } from '#models/ride'

export default class Alert extends BaseModel {
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare userId: string

  @column()
  declare eventId: string

  @column()
  declare originLat: number

  @column()
  declare originLng: number

  @column()
  declare radiusKm: number

  @column()
  declare direction: RideDirection

  @column()
  declare isActive: boolean

  @column.dateTime()
  declare triggeredAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => User, { foreignKey: 'userId' })
  declare user: BelongsTo<typeof User>

  @belongsTo(() => Event, { foreignKey: 'eventId' })
  declare event: BelongsTo<typeof Event>
}
