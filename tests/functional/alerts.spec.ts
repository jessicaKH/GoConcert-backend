import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import Alert from '#models/alert'
import { createUser, createEvent } from '#tests/helpers/index'

const validAlertPayload = (eventId: string) => ({
  eventId,
  direction: 'OUTBOUND' as const,
  originLat: 45.74,
  originLng: 4.83,
  radiusKm: 20,
})

test.group('POST /api/v1/alerts', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('returns 401 without auth', async ({ client }) => {
    const response = await client.post('/api/v1/alerts').json({} as any)
    response.assertStatus(401)
  })

  test('creates an alert for authenticated user', async ({ client, assert }) => {
    const user = await createUser()
    const event = await createEvent()

    const response = await client
      .post('/api/v1/alerts')
      .loginAs(user)
      .json(validAlertPayload(event.id))
    response.assertStatus(201)

    const count = await Alert.query().where('userId', user.id).count('* as total')
    assert.equal(Number(count[0].$extras.total), 1)
  })

  test('returns 422 for invalid direction', async ({ client }) => {
    const user = await createUser()
    const event = await createEvent()

    const response = await client
      .post('/api/v1/alerts')
      .loginAs(user)
      .json({ ...validAlertPayload(event.id), direction: 'SIDEWAYS' } as any)
    response.assertStatus(422)
  })
})

test.group('GET /api/v1/alerts', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('returns 401 without auth', async ({ client }) => {
    const response = await client.get('/api/v1/alerts')
    response.assertStatus(401)
  })

  test('returns only current user alerts', async ({ client, assert }) => {
    const userA = await createUser()
    const userB = await createUser()
    const event = await createEvent()

    await client.post('/api/v1/alerts').loginAs(userA).json(validAlertPayload(event.id))
    await client
      .post('/api/v1/alerts')
      .loginAs(userA)
      .json({ ...validAlertPayload(event.id), direction: 'RETURN' as const })
    await client.post('/api/v1/alerts').loginAs(userB).json(validAlertPayload(event.id))

    const response = await client.get('/api/v1/alerts').loginAs(userA)
    response.assertStatus(200)
    const items = response.body() as any[]
    assert.equal(items.length, 2)
  })
})

test.group('DELETE /api/v1/alerts/:id', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('returns 401 without auth', async ({ client }) => {
    const response = await client.delete('/api/v1/alerts/some-id')
    response.assertStatus(401)
  })

  test('user can delete their own alert', async ({ client, assert }) => {
    const user = await createUser()
    const event = await createEvent()

    const createRes = await client
      .post('/api/v1/alerts')
      .loginAs(user)
      .json(validAlertPayload(event.id))
    const alertId = (createRes.body() as any).id

    const response = await client.delete(`/api/v1/alerts/${alertId}`).loginAs(user)
    response.assertStatus(200)

    const count = await Alert.query().where('id', alertId).count('* as total')
    assert.equal(Number(count[0].$extras.total), 0)
  })

  test('user cannot delete another user alert', async ({ client }) => {
    const userA = await createUser()
    const userB = await createUser()
    const event = await createEvent()

    const createRes = await client
      .post('/api/v1/alerts')
      .loginAs(userA)
      .json(validAlertPayload(event.id))
    const alertId = (createRes.body() as any).id

    const response = await client.delete(`/api/v1/alerts/${alertId}`).loginAs(userB)
    response.assertStatus(403)
  })
})
