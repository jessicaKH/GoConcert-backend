import { BaseModel, belongsTo, column, hasOne } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasOne } from '@adonisjs/lucid/types/relations'
import { DateTime } from 'luxon'
import User from '#models/user'
import Ride from '#models/ride'

let Review: any

setImmediate(async () => {
  if (!Review) Review = (await import('#models/review')).default
})

export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED'
export type PaymentStatus = 'UNPAID' | 'PAID' | 'REFUNDED' | 'PARTIALLY_REFUNDED'

export default class Booking extends BaseModel {
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare passengerId: string

  @column()
  declare rideId: string

  @column()
  declare seatsBooked: number

  @column()
  declare totalPrice: number

  @column()
  declare commission: number

  @column()
  declare status: BookingStatus

  @column()
  declare paymentIntentId: string | null

  @column()
  declare paymentStatus: PaymentStatus

  @column()
  declare cancelledBy: string | null

  @column.dateTime()
  declare cancelledAt: DateTime | null

  @column()
  declare cancelReason: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  get bookingRef(): string {
    const year = this.createdAt.year
    const shortId = this.id.slice(0, 8).toUpperCase()
    return `GC-${year}-${shortId}`
  }

  @belongsTo(() => User, { foreignKey: 'passengerId' })
  declare passenger: BelongsTo<typeof User>

  @belongsTo(() => Ride, { foreignKey: 'rideId' })
  declare ride: BelongsTo<typeof Ride>

  @hasOne(() => Review, { foreignKey: 'bookingId' })
  declare review: HasOne<typeof Review>
}
