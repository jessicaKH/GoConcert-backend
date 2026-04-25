import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import Ride from '#models/ride'
import Booking from '#models/booking'
import Review from '#models/review'
import { updateProfileValidator, updatePushTokenValidator } from '#validators/user'

function publicDriverProfile(user: User, preferences: string[]) {
  return {
    id: user.id,
    fullName: user.fullName,
    avatarUrl: user.avatarUrl,
    age: user.age,
    bio: user.bio,
    carModel: user.carModel,
    ratingAsDriver: user.ratingAsDriver,
    ridesAsDriverCount: user.ridesAsDriverCount,
    memberSince: user.memberSince,
    preferences,
  }
}

export default class UsersController {
  async me({ auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    return response.ok({
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      age: user.age,
      bio: user.bio,
      carModel: user.carModel,
      platform: user.platform,
      ratingAsDriver: user.ratingAsDriver,
      ratingAsPassenger: user.ratingAsPassenger,
      ridesAsDriverCount: user.ridesAsDriverCount,
      ridesAsPassengerCount: user.ridesAsPassengerCount,
      memberSince: user.memberSince,
      authProvider: user.authProvider,
    })
  }

  async updateMe({ auth, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const data = await request.validateUsing(updateProfileValidator)

    const updatePayload: Partial<User> = {}
    if (data.fullName !== undefined) updatePayload.fullName = data.fullName
    if (data.bio !== undefined) updatePayload.bio = data.bio
    if (data.carModel !== undefined) updatePayload.carModel = data.carModel
    if (data.avatarUrl !== undefined) updatePayload.avatarUrl = data.avatarUrl
    if (data.birthDate !== undefined) {
      updatePayload.birthDate = (data.birthDate as any) ?? null
    }

    await user.merge(updatePayload).save()
    return response.ok({ message: 'Profil mis à jour' })
  }

  async updatePushToken({ auth, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const { pushToken, platform } = await request.validateUsing(updatePushTokenValidator)

    await user.merge({ pushToken, platform }).save()
    return response.ok({ message: 'Push token mis à jour' })
  }

  async myBookings({ auth, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const page = Number(request.input('page', 1))
    const limit = Number(request.input('limit', 20))

    const bookings = await Booking.query()
      .where('passengerId', user.id)
      .preload('ride', (q) => q.preload('event'))
      .orderBy('createdAt', 'desc')
      .paginate(page, limit)

    return response.ok(bookings.serialize())
  }

  async myRides({ auth, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const page = Number(request.input('page', 1))
    const limit = Number(request.input('limit', 20))

    const rides = await Ride.query()
      .where('driverId', user.id)
      .preload('event')
      .orderBy('departureTime', 'desc')
      .paginate(page, limit)

    return response.ok(rides.serialize())
  }

  async publicProfile({ params, response }: HttpContext) {
    const user = await User.findOrFail(params.id)

    const activeRides = await Ride.query()
      .where('driverId', user.id)
      .where('status', 'ACTIVE')
      .select('constraints')

    const preferences = [...new Set(activeRides.flatMap((r) => r.constraints))]

    return response.ok(publicDriverProfile(user, preferences))
  }

  async userReviews({ params, request, response }: HttpContext) {
    const page = Number(request.input('page', 1))
    const limit = Number(request.input('limit', 20))

    await User.findOrFail(params.id)

    const reviews = await Review.query()
      .where('targetId', params.id)
      .preload('author', (q) => q.select(['id', 'fullName', 'avatarUrl']))
      .orderBy('createdAt', 'desc')
      .paginate(page, limit)

    return response.ok(reviews.serialize())
  }
}
