import type { HttpContext } from '@adonisjs/core/http'
import { randomUUID } from 'node:crypto'
import Review from '#models/review'
import Booking from '#models/booking'
import User from '#models/user'
import { createReviewValidator } from '#validators/review_validator'

export default class ReviewsController {
  async store({ auth, request, response }: HttpContext) {
    const reviewer = auth.getUserOrFail()
    const data = await request.validateUsing(createReviewValidator)

    const booking = await Booking.query()
      .where('id', data.bookingId)
      .preload('ride')
      .firstOrFail()

    if (booking.status !== 'COMPLETED') {
      return response.unprocessableEntity({ message: 'Le trajet doit être terminé pour laisser un avis' })
    }

    const isPassenger = booking.passengerId === reviewer.id
    const isDriver = booking.ride.driverId === reviewer.id

    if (!isPassenger && !isDriver) {
      return response.forbidden({ message: 'Vous n\'avez pas participé à ce trajet' })
    }

    // Validate role matches actual role
    if (data.role === 'PASSENGER_REVIEWING_DRIVER' && !isPassenger) {
      return response.unprocessableEntity({ message: 'Rôle invalide' })
    }
    if (data.role === 'DRIVER_REVIEWING_PASSENGER' && !isDriver) {
      return response.unprocessableEntity({ message: 'Rôle invalide' })
    }

    const targetId =
      data.role === 'PASSENGER_REVIEWING_DRIVER'
        ? booking.ride.driverId
        : booking.passengerId

    const existing = await Review.query()
      .where('bookingId', data.bookingId)
      .where('authorId', reviewer.id)
      .first()

    if (existing) {
      return response.conflict({ message: 'Vous avez déjà laissé un avis pour ce trajet' })
    }

    const review = await Review.create({
      id: randomUUID(),
      bookingId: data.bookingId,
      authorId: reviewer.id,
      targetId,
      role: data.role,
      rating: data.rating,
      comment: data.comment ?? null,
    })

    // Update target user's average rating
    await this.updateUserRating(targetId, data.role)

    return response.created(review.serialize())
  }

  private async updateUserRating(
    userId: string,
    role: 'DRIVER_REVIEWING_PASSENGER' | 'PASSENGER_REVIEWING_DRIVER'
  ): Promise<void> {
    const user = await User.findOrFail(userId)

    const field =
      role === 'PASSENGER_REVIEWING_DRIVER' ? 'ratingAsDriver' : 'ratingAsPassenger'
    const countField =
      role === 'PASSENGER_REVIEWING_DRIVER' ? 'ridesAsDriverCount' : 'ridesAsPassengerCount'

    const reviews = await Review.query()
      .where('targetId', userId)
      .where('role', role)
      .select('rating')

    const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length

    await user
      .merge({
        [field]: Math.round(avg * 10) / 10,
        [countField]: reviews.length,
      })
      .save()
  }
}
