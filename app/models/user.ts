import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import { DbAccessTokensProvider } from '@adonisjs/auth/access_tokens'
import type { AccessToken } from '@adonisjs/auth/access_tokens'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import { DateTime } from 'luxon'

// Relations imported lazily to break circular deps — the () => Model callback is
// evaluated only when a relation query runs, by which time all modules are loaded.
let Ride: any
let Booking: any
let Alert: any
let Review: any

async function loadRelations() {
  if (!Ride) Ride = (await import('#models/ride')).default
  if (!Booking) Booking = (await import('#models/booking')).default
  if (!Alert) Alert = (await import('#models/alert')).default
  if (!Review) Review = (await import('#models/review')).default
}

// Pre-load on next tick so sync accessors work
setImmediate(() => loadRelations().catch(() => {}))

export default class User extends BaseModel {
  static selfAssignPrimaryKey = true
  static accessTokens = DbAccessTokensProvider.forModel(User)
  declare currentAccessToken?: AccessToken

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare email: string | null

  @column()
  declare phone: string | null

  @column()
  declare fullName: string

  @column()
  declare avatarUrl: string | null

  @column()
  declare authProvider: 'GOOGLE' | 'APPLE' | 'PHONE_OTP'

  @column()
  declare providerId: string

  @column.dateTime()
  declare birthDate: DateTime | null

  @column()
  declare bio: string | null

  @column()
  declare carModel: string | null

  @column()
  declare pushToken: string | null

  @column()
  declare platform: 'ios' | 'android' | null

  @column()
  declare ratingAsDriver: number

  @column()
  declare ratingAsPassenger: number

  @column()
  declare ridesAsDriverCount: number

  @column()
  declare ridesAsPassengerCount: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  get age(): number | null {
    if (!this.birthDate) return null
    return Math.floor(DateTime.now().diff(this.birthDate, 'years').years)
  }

  get memberSince(): string {
    return this.createdAt.toFormat('yyyy-MM')
  }

  @hasMany(() => Ride, { foreignKey: 'driverId' })
  declare ridesAsDriver: HasMany<typeof Ride>

  @hasMany(() => Booking, { foreignKey: 'passengerId' })
  declare bookings: HasMany<typeof Booking>

  @hasMany(() => Alert, { foreignKey: 'userId' })
  declare alertsSet: HasMany<typeof Alert>

  @hasMany(() => Review, { foreignKey: 'authorId' })
  declare reviewsGiven: HasMany<typeof Review>

  @hasMany(() => Review, { foreignKey: 'targetId' })
  declare reviewsReceived: HasMany<typeof Review>
}
