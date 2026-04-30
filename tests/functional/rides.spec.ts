import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { createUser, createEvent, createRide } from '#tests/helpers/index'
import { DateTime } from 'luxon'

test.group('GET /api/v1/rides/price-estimate', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('returns 404 for unknown event', async ({ client }) => {
    const response = await client.get('/api/v1/rides/price-estimate').qs({
      departureLat: 45.74,
      departureLng: 4.83,
      eventId: 'tm_unknown',
    })
    response.assertStatus(404)
  })

  test('returns min and max price for known event', async ({ client, assert }) => {
    const event = await createEvent()
    const response = await client.get('/api/v1/rides/price-estimate').qs({
      departureLat: 45.74,
      departureLng: 4.83,
      eventId: event.id,
    })
    response.assertStatus(200)
    const body = response.body() as any
    assert.isNumber(body.minPrice)
    assert.isNumber(body.maxPrice)
    assert.isAtMost(body.minPrice, body.maxPrice)
    assert.isNumber(body.distanceKm)
  })

  test('returns 422 when coords are missing', async ({ client }) => {
    const response = await client
      .get('/api/v1/rides/price-estimate')
      .qs({ eventId: 'tm_x' } as any)
    response.assertStatus(422)
  })
})

test.group('POST /api/v1/rides', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('returns 401 without authentication', async ({ client }) => {
    const response = await client.post('/api/v1/rides').json({} as any)
    response.assertStatus(401)
  })

  test('creates a ride successfully', async ({ client, assert }) => {
    const driver = await createUser()
    const event = await createEvent()

    const response = await client
      .post('/api/v1/rides')
      .loginAs(driver)
      .json({
        eventId: event.id,
        direction: 'OUTBOUND',
        departureLat: 45.74,
        departureLng: 4.83,
        departureAddress: '1 Rue du Test, 69001 Lyon',
        departureTime: DateTime.now().plus({ days: 30 }).toISO(),
        totalSeats: 3,
        pricePerSeat: 10,
      })

    response.assertStatus(201)
    const body = response.body() as any
    assert.equal(body.direction, 'OUTBOUND')
    assert.equal(body.status, 'ACTIVE')
    assert.equal(body.availableSeats, 3)
  })

  test('rejects price outside estimated range', async ({ client }) => {
    const driver = await createUser()
    const event = await createEvent()

    const response = await client
      .post('/api/v1/rides')
      .loginAs(driver)
      .json({
        eventId: event.id,
        direction: 'OUTBOUND',
        departureLat: 45.74,
        departureLng: 4.83,
        departureAddress: '1 Rue du Test, 69001 Lyon',
        departureTime: DateTime.now().plus({ days: 30 }).toISO(),
        totalSeats: 3,
        pricePerSeat: 999,
      })

    response.assertStatus(422)
  })
})

test.group('GET /api/v1/rides/:id', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('returns 404 for unknown ride', async ({ client }) => {
    const response = await client.get('/api/v1/rides/00000000-0000-0000-0000-000000000000')
    response.assertStatus(404)
  })

  test('returns ride details with driver and event', async ({ client, assert }) => {
    const driver = await createUser({ fullName: 'Charles Driver' })
    const event = await createEvent({ name: 'Big Concert' })
    const ride = await createRide(driver.id, event.id)

    const response = await client.get(`/api/v1/rides/${ride.id}`)
    response.assertStatus(200)
    const body = response.body() as any
    assert.equal(body.driver.fullName, 'Charles Driver')
    assert.equal(body.event.name, 'Big Concert')
    assert.equal(body.availableSeats, 3)
  })
})

test.group('PUT /api/v1/rides/:id', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('returns 401 without auth', async ({ client }) => {
    const response = await client.put('/api/v1/rides/some-id').json({})
    response.assertStatus(401)
  })

  test('returns 403 when not the driver', async ({ client }) => {
    const driver = await createUser()
    const other = await createUser()
    const event = await createEvent()
    const ride = await createRide(driver.id, event.id)

    const response = await client
      .put(`/api/v1/rides/${ride.id}`)
      .loginAs(other)
      .json({ notes: 'hack' })
    response.assertStatus(403)
  })

  test('driver can update notes', async ({ client }) => {
    const driver = await createUser()
    const event = await createEvent()
    const ride = await createRide(driver.id, event.id)

    const response = await client
      .put(`/api/v1/rides/${ride.id}`)
      .loginAs(driver)
      .json({ notes: 'Apportez un masque' })
    response.assertStatus(200)
  })
})

test.group('DELETE /api/v1/rides/:id', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('returns 401 without auth', async ({ client }) => {
    const response = await client.delete('/api/v1/rides/some-id')
    response.assertStatus(401)
  })

  test('returns 403 when not the driver', async ({ client }) => {
    const driver = await createUser()
    const other = await createUser()
    const event = await createEvent()
    const ride = await createRide(driver.id, event.id)

    const response = await client.delete(`/api/v1/rides/${ride.id}`).loginAs(other)
    response.assertStatus(403)
  })

  test('driver can cancel their ride', async ({ client }) => {
    const driver = await createUser()
    const event = await createEvent()
    const ride = await createRide(driver.id, event.id)

    const response = await client.delete(`/api/v1/rides/${ride.id}`).loginAs(driver)
    response.assertStatus(200)
  })
})
