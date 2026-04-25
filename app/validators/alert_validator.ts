import vine from '@vinejs/vine'

export const createAlertValidator = vine.compile(
  vine.object({
    eventId: vine.string().minLength(1),
    originLat: vine.number().range([-90, 90]),
    originLng: vine.number().range([-180, 180]),
    radiusKm: vine.number().range([1, 100]),
    direction: vine.enum(['OUTBOUND', 'RETURN'] as const),
  })
)
