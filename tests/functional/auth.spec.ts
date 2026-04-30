import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { createUser } from '#tests/helpers/index'

test.group('POST /api/v1/auth/otp/send', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('returns 200 for a valid French mobile number', async ({ client }) => {
    const response = await client.post('/api/v1/auth/otp/send').json({ phone: '+33612345678' })
    response.assertStatus(200)
  })

  test('rejects an invalid phone number with 422', async ({ client }) => {
    const response = await client.post('/api/v1/auth/otp/send').json({ phone: 'notaphone' })
    response.assertStatus(422)
  })

  test('rejects missing phone with 422', async ({ client }) => {
    const response = await client.post('/api/v1/auth/otp/send').json({} as any)
    response.assertStatus(422)
  })
})

test.group('POST /api/v1/auth/otp/verify', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('rejects wrong OTP code with 401', async ({ client }) => {
    const response = await client
      .post('/api/v1/auth/otp/verify')
      .json({ phone: '+33612345678', code: '000000' })
    response.assertStatus(401)
  })

  test('rejects malformed code (not 6 digits) with 422', async ({ client }) => {
    const response = await client
      .post('/api/v1/auth/otp/verify')
      .json({ phone: '+33612345678', code: '123' } as any)
    response.assertStatus(422)
  })
})

test.group('POST /api/v1/auth/refresh', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('rejects invalid refresh token with 401', async ({ client }) => {
    const response = await client
      .post('/api/v1/auth/refresh')
      .json({ refreshToken: 'a'.repeat(64) })
    response.assertStatus(401)
  })

  test('rejects missing refreshToken with 422', async ({ client }) => {
    const response = await client.post('/api/v1/auth/refresh').json({} as any)
    response.assertStatus(422)
  })
})

test.group('POST /api/v1/auth/logout', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('returns 401 without authentication', async ({ client }) => {
    const response = await client.post('/api/v1/auth/logout').json({})
    response.assertStatus(401)
  })

  test('returns 200 when authenticated', async ({ client }) => {
    const user = await createUser()
    const response = await client.post('/api/v1/auth/logout').loginAs(user).json({})
    response.assertStatus(200)
  })
})
