import vine from '@vinejs/vine'

export const createReviewValidator = vine.compile(
  vine.object({
    bookingId: vine.string().uuid(),
    role: vine.enum(['DRIVER_REVIEWING_PASSENGER', 'PASSENGER_REVIEWING_DRIVER'] as const),
    rating: vine.number().range([1, 5]),
    comment: vine.string().maxLength(1000).optional(),
  })
)
