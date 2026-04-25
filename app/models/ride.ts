import { BaseModel, belongsTo, column, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import { DateTime } from 'luxon'
import User from '#models/user'
import Event from '#models/event'

let Booking: any

setImmediate(async () => {
  if (!Booking) Booking = (await import('#models/booking')).default
})

export type RideDirection = 'OUTBOUND' | 'RETURN'
export type RideStatus = 'ACTIVE' | 'FULL' | 'CANCELLED' | 'COMPLETED'

export default class Ride extends BaseModel {
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare driverId: string

  @column()
  declare eventId: string

  @column()
  declare direction: RideDirection

  @column()
  declare departureLat: number

  @column()
  declare departureLng: number

  @column()
  declare departureAddress: string

  @column.dateTime()
  declare departureTime: DateTime

  @column.dateTime()
  declare estimatedArrival: DateTime | null

  @column()
  declare totalSeats: number

  @column()
  declare availableSeats: number

  @column()
  declare pricePerSeat: number

  @column()
  declare minPrice: number

  @column()
  declare maxPrice: number

  @column({
    prepare: (value: string[]) => JSON.stringify(value),
    consume: (value: string | string[]) =>
      typeof value === 'string' ? JSON.parse(value) : (value ?? []),
  })
  declare constraints: string[]

  @column()
  declare notes: string | null

  @column()
  declare status: RideStatus

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => User, { foreignKey: 'driverId' })
  declare driver: BelongsTo<typeof User>

  @belongsTo(() => Event, { foreignKey: 'eventId' })
  declare event: BelongsTo<typeof Event>

  @hasMany(() => Booking, { foreignKey: 'rideId' })
  declare bookings: HasMany<typeof Booking>
}
