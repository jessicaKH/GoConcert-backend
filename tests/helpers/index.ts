import { randomUUID } from 'node:crypto'
import { DateTime } from 'luxon'
import User from '#models/user'
import Event from '#models/event'
import Ride from '#models/ride'

export async function createUser(overrides: Partial<InstanceType<typeof User>> = {}) {
  return User.create({
    id: randomUUID(),
    fullName: 'Test User',
    email: `${randomUUID()}@test.com`,
    phone: null,
    authProvider: 'GOOGLE',
    providerId: randomUUID(),
    avatarUrl: null,
    bio: null,
    carModel: null,
    pushToken: null,
    platform: null,
    ratingAsDriver: 0,
    ratingAsPassenger: 0,
    ridesAsDriverCount: 0,
    ridesAsPassengerCount: 0,
    ...overrides,
  } as any)
}

export async function createEvent(overrides: Record<string, any> = {}) {
  const tmId = randomUUID().replace(/-/g, '').slice(0, 8)
  return Event.create({
    id: `tm_${tmId}`,
    ticketmasterId: tmId,
    name: 'Test Concert',
    venueName: 'Test Venue',
    venueAddress: '1 Rue de la Paix, 75001 Paris',
    city: 'Paris',
    country: 'FR',
    latitude: 48.8566,
    longitude: 2.3522,
    startsAt: DateTime.now().plus({ days: 30 }),
    imageUrl: null,
    genre: 'CO',
    url: null,
    ...overrides,
  })
}

export async function createRide(
  driverId: string,
  eventId: string,
  overrides: Record<string, any> = {}
) {
  return Ride.create({
    id: randomUUID(),
    driverId,
    eventId,
    direction: 'OUTBOUND',
    departureLat: 48.7,
    departureLng: 2.1,
    departureAddress: '1 Rue du Test, 69001 Lyon',
    departureTime: DateTime.now().plus({ days: 30, hours: -2 }),
    estimatedArrival: null,
    totalSeats: 3,
    availableSeats: 3,
    pricePerSeat: 10,
    minPrice: 8,
    maxPrice: 15,
    constraints: [],
    notes: null,
    status: 'ACTIVE',
    ...overrides,
  })
}
