import vine from '@vinejs/vine'

export const googleAuthValidator = vine.compile(
  vine.object({
    idToken: vine.string().minLength(10),
  })
)

export const appleAuthValidator = vine.compile(
  vine.object({
    idToken: vine.string().minLength(10),
  })
)

export const sendOtpValidator = vine.compile(
  vine.object({
    phone: vine.string().mobile({ locale: ['fr-FR'] }),
  })
)

export const verifyOtpValidator = vine.compile(
  vine.object({
    phone: vine.string().mobile({ locale: ['fr-FR'] }),
    code: vine.string().fixedLength(6).regex(/^\d{6}$/),
  })
)

export const refreshTokenValidator = vine.compile(
  vine.object({
    refreshToken: vine.string().minLength(32),
  })
)

export const logoutValidator = vine.compile(
  vine.object({
    refreshToken: vine.string().minLength(32).optional(),
  })
)
