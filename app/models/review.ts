import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { DateTime } from 'luxon'
import User from '#models/user'
import Booking from '#models/booking'

export type ReviewRole = 'DRIVER_REVIEWING_PASSENGER' | 'PASSENGER_REVIEWING_DRIVER'

export default class Review extends BaseModel {
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare bookingId: string

  @column()
  declare authorId: string

  @column()
  declare targetId: string

  @column()
  declare role: ReviewRole

  @column()
  declare rating: number

  @column()
  declare comment: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @belongsTo(() => Booking, { foreignKey: 'bookingId' })
  declare booking: BelongsTo<typeof Booking>

  @belongsTo(() => User, { foreignKey: 'authorId' })
  declare author: BelongsTo<typeof User>

  @belongsTo(() => User, { foreignKey: 'targetId' })
  declare target: BelongsTo<typeof User>
}
