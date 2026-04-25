import type { HttpContext } from '@adonisjs/core/http'
import { randomUUID } from 'node:crypto'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import Booking from '#models/booking'
import Ride from '#models/ride'
import PricingService from '#services/pricing_service'
import { createBookingValidator, cancelBookingValidator } from '#validators/booking_validator'

export default class BookingsController {
  async store({ auth, request, response }: HttpContext) {
    const passenger = auth.getUserOrFail()
    const { rideId, seatsBooked } = await request.validateUsing(createBookingValidator)

    const booking = await db.transaction(async (trx) => {
      // Lock ride row to prevent overbooking race condition
      const ride = await Ride.query({ client: trx })
        .where('id', rideId)
        .forUpdate()
        .firstOrFail()

      if (ride.status !== 'ACTIVE') {
        throw Object.assign(new Error('Ce trajet n\'est plus disponible'), { code: 422 })
      }

      if (ride.driverId === passenger.id) {
        throw Object.assign(new Error('Vous ne pouvez pas réserver votre propre trajet'), { code: 422 })
      }

      if (ride.availableSeats < seatsBooked) {
        throw Object.assign(
          new Error(`Seulement ${ride.availableSeats} place(s) disponible(s)`),
          { code: 422 }
        )
      }

      const totalPrice = Math.round(ride.pricePerSeat * seatsBooked * 100) / 100
      const commission = PricingService.calculateCommission(totalPrice)

      const newAvailableSeats = ride.availableSeats - seatsBooked
      await ride.useTransaction(trx).merge({
        availableSeats: newAvailableSeats,
        status: newAvailableSeats === 0 ? 'FULL' : 'ACTIVE',
      }).save()

      return Booking.create(
        {
          id: randomUUID(),
          passengerId: passenger.id,
          rideId: ride.id,
          seatsBooked,
          totalPrice,
          commission,
          status: 'CONFIRMED',
          paymentStatus: 'UNPAID',
        },
        { client: trx }
      )
    })

    return response.created({
      id: booking.id,
      seatsBooked: booking.seatsBooked,
      totalPrice: booking.totalPrice,
      commission: booking.commission,
      amountToDriver: Math.round((booking.totalPrice - booking.commission) * 100) / 100,
      status: booking.status,
      paymentStatus: booking.paymentStatus,
    })
  }

  async show({ auth, params, response }: HttpContext) {
    const user = auth.getUserOrFail()

    const booking = await Booking.query()
      .where('id', params.id)
      .preload('ride', (q) => q.preload('event').preload('driver'))
      .preload('passenger')
      .firstOrFail()

    if (booking.passengerId !== user.id && booking.ride.driverId !== user.id) {
      return response.forbidden({ message: 'Accès non autorisé' })
    }

    return response.ok(booking.serialize())
  }

  async cancel({ auth, params, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const { reason } = await request.validateUsing(cancelBookingValidator)

    const booking = await Booking.query()
      .where('id', params.id)
      .preload('ride')
      .firstOrFail()

    if (booking.passengerId !== user.id && booking.ride.driverId !== user.id) {
      return response.forbidden({ message: 'Accès non autorisé' })
    }

    if (!['PENDING', 'CONFIRMED'].includes(booking.status)) {
      return response.unprocessableEntity({ message: 'Cette réservation ne peut plus être annulée' })
    }

    await db.transaction(async (trx) => {
      // Restore seats to ride
      const ride = await Ride.query({ client: trx })
        .where('id', booking.rideId)
        .forUpdate()
        .firstOrFail()

      const restoredSeats = ride.availableSeats + booking.seatsBooked
      await ride.useTransaction(trx).merge({
        availableSeats: restoredSeats,
        status: ride.status === 'FULL' ? 'ACTIVE' : ride.status,
      }).save()

      await booking.useTransaction(trx).merge({
        status: 'CANCELLED',
        cancelledBy: user.id,
        cancelledAt: DateTime.now(),
        cancelReason: reason ?? null,
      }).save()
    })

    return response.ok({ message: 'Réservation annulée' })
  }

  async invoice({ auth, params, response }: HttpContext) {
    const user = auth.getUserOrFail()

    const booking = await Booking.query()
      .where('id', params.id)
      .preload('ride', (q) => q.preload('event').preload('driver'))
      .preload('passenger')
      .firstOrFail()

    if (booking.passengerId !== user.id && booking.ride.driverId !== user.id) {
      return response.forbidden({ message: 'Accès non autorisé' })
    }

    const ride = booking.ride
    const event = ride.event
    const driver = ride.driver
    const passenger = booking.passenger

    return response.ok({
      bookingRef: booking.bookingRef,
      status: booking.status,
      passenger: { fullName: passenger.fullName, phone: passenger.phone },
      driver: {
        fullName: driver.fullName,
        avatarUrl: driver.avatarUrl,
        age: driver.age,
        carModel: driver.carModel,
        ratingAsDriver: driver.ratingAsDriver,
      },
      event: {
        name: event.name,
        venueName: event.venueName,
        startsAt: event.startsAt.toISO(),
      },
      ride: {
        direction: ride.direction,
        departureAddress: ride.departureAddress,
        departureTime: ride.departureTime.toISO(),
        estimatedArrival: ride.estimatedArrival?.toISO() ?? null,
        constraints: ride.constraints,
      },
      pricing: {
        pricePerSeat: ride.pricePerSeat,
        seatsBooked: booking.seatsBooked,
        subtotal: booking.totalPrice,
        platformFee: booking.commission,
        total: booking.totalPrice,
        currency: 'EUR',
      },
      payment: { status: booking.paymentStatus, stub: true },
    })
  }
}
