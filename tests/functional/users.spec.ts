import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { createUser } from '#tests/helpers/index'

test.group('GET /api/v1/users/me', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('returns 401 without authentication', async ({ client }) => {
    const response = await client.get('/api/v1/users/me')
    response.assertStatus(401)
  })

  test('returns authenticated user profile', async ({ client, assert }) => {
    const user = await createUser({ fullName: 'Alice Dupont', email: 'alice@test.com' })
    const response = await client.get('/api/v1/users/me').loginAs(user)
    response.assertStatus(200)
    const body = response.body() as any
    assert.equal(body.fullName, 'Alice Dupont')
    assert.equal(body.email, 'alice@test.com')
  })

  test('does not expose pushToken or providerId', async ({ client, assert }) => {
    const user = await createUser()
    const response = await client.get('/api/v1/users/me').loginAs(user)
    const body = response.body() as any
    assert.notProperty(body, 'pushToken')
    assert.notProperty(body, 'providerId')
  })
})

test.group('GET /api/v1/users/:id/profile', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('returns public profile without auth', async ({ client, assert }) => {
    const user = await createUser({ fullName: 'Bob Driver', carModel: 'Renault Clio' })
    const response = await client.get(`/api/v1/users/${user.id}/profile`)
    response.assertStatus(200)
    const body = response.body() as any
    assert.equal(body.fullName, 'Bob Driver')
  })

  test('does not expose email, phone or birthDate in public profile', async ({
    client,
    assert,
  }) => {
    const user = await createUser({ email: 'secret@test.com' })
    const response = await client.get(`/api/v1/users/${user.id}/profile`)
    const body = response.body() as any
    assert.notProperty(body, 'email')
    assert.notProperty(body, 'phone')
    assert.notProperty(body, 'birthDate')
  })

  test('returns 404 for unknown user', async ({ client }) => {
    const response = await client.get('/api/v1/users/00000000-0000-0000-0000-000000000000/profile')
    response.assertStatus(404)
  })
})

test.group('PUT /api/v1/users/me', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('returns 401 without auth', async ({ client }) => {
    const response = await client.put('/api/v1/users/me').json({ fullName: 'New Name' } as any)
    response.assertStatus(401)
  })

  test('updates profile fields', async ({ client }) => {
    const user = await createUser()
    const response = await client
      .put('/api/v1/users/me')
      .loginAs(user)
      .json({ fullName: 'Updated Name', bio: 'I love concerts' })
    response.assertStatus(200)
  })
})
