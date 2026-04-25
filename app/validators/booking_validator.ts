import vine from '@vinejs/vine'

export const createBookingValidator = vine.compile(
  vine.object({
    rideId: vine.string().uuid(),
    seatsBooked: vine.number().range([1, 8]),
  })
)

export const cancelBookingValidator = vine.compile(
  vine.object({
    reason: vine.string().maxLength(500).optional(),
  })
)
