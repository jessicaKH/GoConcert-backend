import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import Ride from '#models/ride'
import { createUser, createEvent, createRide } from '#tests/helpers/index'

test.group('POST /api/v1/bookings', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('returns 401 without authentication', async ({ client }) => {
    const response = await client.post('/api/v1/bookings').json({ rideId: 'x', seatsBooked: 1 })
    response.assertStatus(401)
  })

  test('passenger cannot book their own ride', async ({ client }) => {
    const driver = await createUser()
    const event = await createEvent()
    const ride = await createRide(driver.id, event.id)

    const response = await client
      .post('/api/v1/bookings')
      .loginAs(driver)
      .json({ rideId: ride.id, seatsBooked: 1 })
    response.assertStatus(422)
  })

  test('returns 422 when not enough seats available', async ({ client }) => {
    const driver = await createUser()
    const passenger = await createUser()
    const event = await createEvent()
    const ride = await createRide(driver.id, event.id, { totalSeats: 1, availableSeats: 1 })

    const response = await client
      .post('/api/v1/bookings')
      .loginAs(passenger)
      .json({ rideId: ride.id, seatsBooked: 5 })
    response.assertStatus(422)
  })

  test('creates booking and decrements available seats', async ({ client, assert }) => {
    const driver = await createUser()
    const passenger = await createUser()
    const event = await createEvent()
    const ride = await createRide(driver.id, event.id, { totalSeats: 3, availableSeats: 3 })

    const response = await client
      .post('/api/v1/bookings')
      .loginAs(passenger)
      .json({ rideId: ride.id, seatsBooked: 2 })
    response.assertStatus(201)

    const body = response.body() as any
    assert.equal(body.seatsBooked, 2)
    assert.equal(body.status, 'CONFIRMED')

    const updatedRide = await Ride.findOrFail(ride.id)
    assert.equal(updatedRide.availableSeats, 1)
  })

  test('ride becomes FULL when last seat is booked', async ({ client, assert }) => {
    const driver = await createUser()
    const passenger = await createUser()
    const event = await createEvent()
    const ride = await createRide(driver.id, event.id, { totalSeats: 1, availableSeats: 1 })

    await client
      .post('/api/v1/bookings')
      .loginAs(passenger)
      .json({ rideId: ride.id, seatsBooked: 1 })

    const updatedRide = await Ride.findOrFail(ride.id)
    assert.equal(updatedRide.status, 'FULL')
    assert.equal(updatedRide.availableSeats, 0)
  })

  test('validates seatsBooked range', async ({ client }) => {
    const driver = await createUser()
    const passenger = await createUser()
    const event = await createEvent()
    const ride = await createRide(driver.id, event.id)

    const response = await client
      .post('/api/v1/bookings')
      .loginAs(passenger)
      .json({ rideId: ride.id, seatsBooked: 0 })
    response.assertStatus(422)
  })
})

test.group('POST /api/v1/bookings/:id/cancel', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('passenger can cancel their booking and seats are restored', async ({
    client,
    assert,
  }) => {
    const driver = await createUser()
    const passenger = await createUser()
    const event = await createEvent()
    const ride = await createRide(driver.id, event.id, { totalSeats: 3, availableSeats: 3 })

    const bookResponse = await client
      .post('/api/v1/bookings')
      .loginAs(passenger)
      .json({ rideId: ride.id, seatsBooked: 2 })
    const bookingId = (bookResponse.body() as any).id

    const cancelResponse = await client
      .post(`/api/v1/bookings/${bookingId}/cancel`)
      .loginAs(passenger)
      .json({ reason: 'Plans changed' })
    cancelResponse.assertStatus(200)

    const updatedRide = await Ride.findOrFail(ride.id)
    assert.equal(updatedRide.availableSeats, 3)
  })

  test('unauthorised user cannot cancel booking', async ({ client }) => {
    const driver = await createUser()
    const passenger = await createUser()
    const other = await createUser()
    const event = await createEvent()
    const ride = await createRide(driver.id, event.id)

    const bookResponse = await client
      .post('/api/v1/bookings')
      .loginAs(passenger)
      .json({ rideId: ride.id, seatsBooked: 1 })
    const bookingId = (bookResponse.body() as any).id

    const cancelResponse = await client
      .post(`/api/v1/bookings/${bookingId}/cancel`)
      .loginAs(other)
      .json({})
    cancelResponse.assertStatus(403)
  })

  test('restores ride status to ACTIVE when cancelling from FULL', async ({ client, assert }) => {
    const driver = await createUser()
    const passenger = await createUser()
    const event = await createEvent()
    const ride = await createRide(driver.id, event.id, { totalSeats: 1, availableSeats: 1 })

    const bookResponse = await client
      .post('/api/v1/bookings')
      .loginAs(passenger)
      .json({ rideId: ride.id, seatsBooked: 1 })
    const bookingId = (bookResponse.body() as any).id

    await client
      .post(`/api/v1/bookings/${bookingId}/cancel`)
      .loginAs(passenger)
      .json({})

    const updatedRide = await Ride.findOrFail(ride.id)
    assert.equal(updatedRide.status, 'ACTIVE')
    assert.equal(updatedRide.availableSeats, 1)
  })
})

test.group('GET /api/v1/bookings/:id', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('returns 401 without auth', async ({ client }) => {
    const response = await client.get('/api/v1/bookings/some-id')
    response.assertStatus(401)
  })

  test('returns 403 for unrelated user', async ({ client }) => {
    const driver = await createUser()
    const passenger = await createUser()
    const other = await createUser()
    const event = await createEvent()
    const ride = await createRide(driver.id, event.id)

    const bookResponse = await client
      .post('/api/v1/bookings')
      .loginAs(passenger)
      .json({ rideId: ride.id, seatsBooked: 1 })
    const bookingId = (bookResponse.body() as any).id

    const response = await client.get(`/api/v1/bookings/${bookingId}`).loginAs(other)
    response.assertStatus(403)
  })

  test('passenger can view their booking', async ({ client }) => {
    const driver = await createUser()
    const passenger = await createUser()
    const event = await createEvent()
    const ride = await createRide(driver.id, event.id)

    const bookResponse = await client
      .post('/api/v1/bookings')
      .loginAs(passenger)
      .json({ rideId: ride.id, seatsBooked: 1 })
    const bookingId = (bookResponse.body() as any).id

    const response = await client.get(`/api/v1/bookings/${bookingId}`).loginAs(passenger)
    response.assertStatus(200)
  })
})
