import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import { DateTime } from 'luxon'

let Ride: any
let Alert: any

setImmediate(async () => {
  if (!Ride) Ride = (await import('#models/ride')).default
  if (!Alert) Alert = (await import('#models/alert')).default
})

export default class Event extends BaseModel {
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare ticketmasterId: string

  @column()
  declare name: string

  @column()
  declare venueName: string

  @column()
  declare venueAddress: string

  @column()
  declare city: string

  @column()
  declare country: string

  @column()
  declare latitude: number

  @column()
  declare longitude: number

  @column.dateTime()
  declare startsAt: DateTime

  @column()
  declare imageUrl: string | null

  @column()
  declare genre: string | null

  @column()
  declare url: string | null

  @column.dateTime({ autoCreate: true })
  declare cachedAt: DateTime

  @hasMany(() => Ride, { foreignKey: 'eventId' })
  declare rides: HasMany<typeof Ride>

  @hasMany(() => Alert, { foreignKey: 'eventId' })
  declare alerts: HasMany<typeof Alert>
}
