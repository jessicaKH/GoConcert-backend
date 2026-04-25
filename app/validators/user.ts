import vine from '@vinejs/vine'

export const updateProfileValidator = vine.compile(
  vine.object({
    fullName: vine.string().minLength(1).maxLength(100).optional(),
    bio: vine.string().maxLength(500).optional(),
    carModel: vine.string().maxLength(100).optional(),
    avatarUrl: vine.string().url().optional(),
    birthDate: vine.date().optional(),
  })
)

export const updatePushTokenValidator = vine.compile(
  vine.object({
    pushToken: vine.string().minLength(10),
    platform: vine.enum(['ios', 'android'] as const),
  })
)
