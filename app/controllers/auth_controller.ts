import type { HttpContext } from '@adonisjs/core/http'
import { randomUUID, randomBytes, randomInt } from 'node:crypto'
import { DateTime } from 'luxon'
import { OAuth2Client } from 'google-auth-library'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import User from '#models/user'
import RefreshToken from '#models/refresh_token'
import OtpCode from '#models/otp_code'
import {
  googleAuthValidator,
  appleAuthValidator,
  sendOtpValidator,
  verifyOtpValidator,
  refreshTokenValidator,
  logoutValidator,
} from '#validators/auth_validator'
import env from '#start/env'

const APPLE_JWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'))
const ACCESS_TOKEN_EXPIRY = '15 minutes' as const
const REFRESH_TOKEN_DAYS = 30

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function findOrCreateUser(data: {
  providerId: string
  authProvider: 'GOOGLE' | 'APPLE' | 'PHONE_OTP'
  email?: string | null
  phone?: string | null
  fullName?: string
  avatarUrl?: string | null
}) {
  let user = await User.findBy('providerId', data.providerId)
  if (!user) {
    user = await User.create({
      id: randomUUID(),
      providerId: data.providerId,
      authProvider: data.authProvider,
      email: data.email ?? null,
      phone: data.phone ?? null,
      fullName: data.fullName ?? '',
      avatarUrl: data.avatarUrl ?? null,
      ratingAsDriver: 0,
      ratingAsPassenger: 0,
      ridesAsDriverCount: 0,
      ridesAsPassengerCount: 0,
    })
  }
  return user
}

async function createTokenPair(user: User) {
  const [accessToken, refreshTokenValue] = await Promise.all([
    User.accessTokens.create(user, ['*'], { expiresIn: ACCESS_TOKEN_EXPIRY }),
    (async () => {
      const token = randomBytes(32).toString('hex')
      await RefreshToken.create({
        id: randomUUID(),
        userId: user.id,
        token,
        expiresAt: DateTime.now().plus({ days: REFRESH_TOKEN_DAYS }),
      })
      return token
    })(),
  ])
  return {
    token: accessToken.value!.release(),
    refreshToken: refreshTokenValue,
  }
}

function userPublicDto(user: User) {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    avatarUrl: user.avatarUrl,
    authProvider: user.authProvider,
  }
}

// ─── Controller ───────────────────────────────────────────────────────────────

export default class AuthController {
  async googleLogin({ request, response }: HttpContext) {
    const { idToken } = await request.validateUsing(googleAuthValidator)

    const clientId = env.get('GOOGLE_CLIENT_ID')
    if (!clientId) {
      return response.unprocessableEntity({ message: 'Google OAuth non configuré' })
    }

    const client = new OAuth2Client(clientId)
    const ticket = await client.verifyIdToken({ idToken, audience: clientId })
    const payload = ticket.getPayload()
    if (!payload?.sub) {
      return response.unauthorized({ message: 'Token Google invalide' })
    }

    const user = await findOrCreateUser({
      providerId: payload.sub,
      authProvider: 'GOOGLE',
      email: payload.email,
      fullName: payload.name,
      avatarUrl: payload.picture,
    })

    const tokens = await createTokenPair(user)
    return response.ok({ ...tokens, user: userPublicDto(user) })
  }

  async appleLogin({ request, response }: HttpContext) {
    const { idToken } = await request.validateUsing(appleAuthValidator)

    const appleClientId = env.get('APPLE_CLIENT_ID')
    if (!appleClientId) {
      return response.unprocessableEntity({ message: 'Apple Sign-In non configuré' })
    }

    let payload: any
    try {
      const result = await jwtVerify(idToken, APPLE_JWKS, {
        issuer: 'https://appleid.apple.com',
        audience: appleClientId,
      })
      payload = result.payload
    } catch {
      return response.unauthorized({ message: 'Token Apple invalide' })
    }

    if (!payload?.sub) {
      return response.unauthorized({ message: 'Token Apple invalide' })
    }

    const user = await findOrCreateUser({
      providerId: payload.sub,
      authProvider: 'APPLE',
      email: payload.email ?? null,
    })

    const tokens = await createTokenPair(user)
    return response.ok({ ...tokens, user: userPublicDto(user) })
  }

  async sendOtp({ request, response }: HttpContext) {
    const { phone } = await request.validateUsing(sendOtpValidator)

    const code = String(randomInt(100000, 999999))
    const expiresAt = DateTime.now().plus({ minutes: 10 })

    // Upsert OTP (one active per phone)
    await OtpCode.updateOrCreate(
      { phone },
      { id: randomUUID(), code, expiresAt, usedAt: null }
    )

    const accountSid = env.get('TWILIO_ACCOUNT_SID')
    const authToken = env.get('TWILIO_AUTH_TOKEN')
    const from = env.get('TWILIO_PHONE_NUMBER')

    if (accountSid && authToken && from) {
      const { default: twilio } = await import('twilio')
      const client = twilio(accountSid, authToken)
      await client.messages.create({
        body: `Votre code GoConcert : ${code}. Valable 10 minutes.`,
        from,
        to: phone,
      })
    }

    return response.ok({ message: 'Code OTP envoyé' })
  }

  async verifyOtp({ request, response }: HttpContext) {
    const { phone, code } = await request.validateUsing(verifyOtpValidator)

    const otpRecord = await OtpCode.query()
      .where('phone', phone)
      .where('code', code)
      .whereNull('used_at')
      .where('expires_at', '>', DateTime.now().toSQL()!)
      .first()

    if (!otpRecord) {
      return response.unauthorized({ message: 'Code OTP invalide ou expiré' })
    }

    await otpRecord.merge({ usedAt: DateTime.now() }).save()

    const user = await findOrCreateUser({
      providerId: phone,
      authProvider: 'PHONE_OTP',
      phone,
    })

    const tokens = await createTokenPair(user)
    return response.ok({ ...tokens, user: userPublicDto(user) })
  }

  async refresh({ request, response }: HttpContext) {
    const { refreshToken } = await request.validateUsing(refreshTokenValidator)

    const tokenRecord = await RefreshToken.query()
      .where('token', refreshToken)
      .where('expires_at', '>', DateTime.now().toSQL()!)
      .first()

    if (!tokenRecord) {
      return response.unauthorized({ message: 'Refresh token invalide ou expiré' })
    }

    const user = await User.findOrFail(tokenRecord.userId)
    const accessToken = await User.accessTokens.create(user, ['*'], {
      expiresIn: ACCESS_TOKEN_EXPIRY,
    })

    return response.ok({ token: accessToken.value!.release() })
  }

  async logout({ auth, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const payload = await request.validateUsing(logoutValidator)

    if (user.currentAccessToken) {
      await User.accessTokens.delete(user, user.currentAccessToken.identifier)
    }

    if (payload.refreshToken) {
      await RefreshToken.query()
        .where('token', payload.refreshToken)
        .where('userId', user.id)
        .delete()
    }

    return response.ok({ message: 'Déconnecté avec succès' })
  }
}
