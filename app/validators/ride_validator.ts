import vine from '@vinejs/vine'

const VALID_CONSTRAINTS = ['NO_SMOKING', 'NO_PETS', 'NO_FOOD', 'NO_LUGGAGE'] as const

export const createRideValidator = vine.compile(
  vine.object({
    eventId: vine.string().minLength(1),
    direction: vine.enum(['OUTBOUND', 'RETURN'] as const),
    departureLat: vine.number().range([-90, 90]),
    departureLng: vine.number().range([-180, 180]),
    departureAddress: vine.string().minLength(5).maxLength(300),
    departureTime: vine.date(),
    estimatedArrival: vine.date().optional(),
    totalSeats: vine.number().range([1, 8]),
    pricePerSeat: vine.number().positive(),
    // constraints is optional — default [] handled in controller
    constraints: vine.array(vine.enum(VALID_CONSTRAINTS)).optional(),
    notes: vine.string().maxLength(500).optional(),
  })
)

export const updateRideValidator = vine.compile(
  vine.object({
    departureTime: vine.date().optional(),
    estimatedArrival: vine.date().optional(),
    pricePerSeat: vine.number().positive().optional(),
    constraints: vine.array(vine.enum(VALID_CONSTRAINTS)).optional(),
    notes: vine.string().maxLength(500).optional(),
  })
)

export const priceEstimateValidator = vine.compile(
  vine.object({
    departureLat: vine.number().range([-90, 90]),
    departureLng: vine.number().range([-180, 180]),
    eventId: vine.string().minLength(1),
  })
)
