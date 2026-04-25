import type { HttpContext } from '@adonisjs/core/http'
import { randomUUID } from 'node:crypto'
import { DateTime } from 'luxon'
import Ride from '#models/ride'
import Event from '#models/event'
import PricingService from '#services/pricing_service'
import NotificationService from '#services/notification_service'
import Booking from '#models/booking'
import {
  createRideValidator,
  updateRideValidator,
  priceEstimateValidator,
} from '#validators/ride_validator'

export default class RidesController {
  async priceEstimate({ request, response }: HttpContext) {
    const { departureLat, departureLng, eventId } = await request.validateUsing(
      priceEstimateValidator
    )

    const event = await Event.find(eventId)
    if (!event) {
      return response.notFound({ message: 'Événement introuvable' })
    }

    const distanceKm = PricingService.haversineKm(
      departureLat,
      departureLng,
      event.latitude,
      event.longitude
    )
    const { min, max } = PricingService.estimatePrice(distanceKm)

    return response.ok({ distanceKm: Math.round(distanceKm * 10) / 10, minPrice: min, maxPrice: max, currency: 'EUR' })
  }

  async store({ auth, request, response }: HttpContext) {
    const driver = auth.getUserOrFail()
    const data = await request.validateUsing(createRideValidator)

    const event = await Event.find(data.eventId)
    if (!event) {
      return response.notFound({ message: 'Événement introuvable' })
    }

    // Calculate price range
    const distanceKm = PricingService.haversineKm(
      data.departureLat,
      data.departureLng,
      event.latitude,
      event.longitude
    )
    const { min: minPrice, max: maxPrice } = PricingService.estimatePrice(distanceKm)

    if (!PricingService.validatePriceInRange(data.pricePerSeat, minPrice, maxPrice)) {
      return response.unprocessableEntity({
        message: `Le prix doit être compris entre ${minPrice}€ et ${maxPrice}€`,
        minPrice,
        maxPrice,
      })
    }

    const ride = await Ride.create({
      id: randomUUID(),
      driverId: driver.id,
      eventId: data.eventId,
      direction: data.direction,
      departureLat: data.departureLat,
      departureLng: data.departureLng,
      departureAddress: data.departureAddress,
      departureTime: data.departureTime as any,
      estimatedArrival: data.estimatedArrival ?? null,
      totalSeats: data.totalSeats,
      availableSeats: data.totalSeats,
      pricePerSeat: data.pricePerSeat,
      minPrice,
      maxPrice,
      constraints: data.constraints ?? [],
      notes: data.notes ?? null,
      status: 'ACTIVE',
    })

    // Async alert matching — don't block response
    NotificationService.matchAndNotifyAlerts(
      ride.id,
      event.id,
      ride.direction,
      ride.departureLat,
      ride.departureLng,
      event.name
    ).catch(() => {})

    return response.created(ride.serialize())
  }

  async show({ params, response }: HttpContext) {
    const ride = await Ride.query()
      .where('id', params.id)
      .preload('driver')
      .preload('event')
      .firstOrFail()

    const activeRides = await Ride.query()
      .where('driverId', ride.driver.id)
      .where('status', 'ACTIVE')
      .select('constraints')

    const preferences = [...new Set(activeRides.flatMap((r) => r.constraints))]

    return response.ok({
      id: ride.id,
      event: {
        id: ride.event.id,
        name: ride.event.name,
        venueName: ride.event.venueName,
        startsAt: ride.event.startsAt.toISO(),
      },
      driver: {
        id: ride.driver.id,
        fullName: ride.driver.fullName,
        avatarUrl: ride.driver.avatarUrl,
        age: ride.driver.age,
        bio: ride.driver.bio,
        carModel: ride.driver.carModel,
        ratingAsDriver: ride.driver.ratingAsDriver,
        ridesAsDriverCount: ride.driver.ridesAsDriverCount,
        memberSince: ride.driver.memberSince,
        preferences,
      },
      direction: ride.direction,
      departureAddress: ride.departureAddress,
      departureLat: ride.departureLat,
      departureLng: ride.departureLng,
      departureTime: ride.departureTime.toISO(),
      estimatedArrival: ride.estimatedArrival?.toISO() ?? null,
      totalSeats: ride.totalSeats,
      availableSeats: ride.availableSeats,
      pricePerSeat: ride.pricePerSeat,
      constraints: ride.constraints,
      notes: ride.notes,
      status: ride.status,
    })
  }

  async update({ auth, params, request, response }: HttpContext) {
    const driver = auth.getUserOrFail()
    const ride = await Ride.findOrFail(params.id)

    if (ride.driverId !== driver.id) {
      return response.forbidden({ message: 'Vous n\'êtes pas le conducteur de ce trajet' })
    }

    if (ride.status !== 'ACTIVE') {
      return response.unprocessableEntity({ message: 'Ce trajet ne peut plus être modifié' })
    }

    const data = await request.validateUsing(updateRideValidator)

    const updatePayload: Partial<Ride> = {}
    if (data.departureTime) updatePayload.departureTime = data.departureTime as any
    if (data.estimatedArrival) updatePayload.estimatedArrival = data.estimatedArrival as any
    if (data.pricePerSeat !== undefined) {
      if (!PricingService.validatePriceInRange(data.pricePerSeat, ride.minPrice, ride.maxPrice)) {
        return response.unprocessableEntity({
          message: `Le prix doit être compris entre ${ride.minPrice}€ et ${ride.maxPrice}€`,
        })
      }
      updatePayload.pricePerSeat = data.pricePerSeat
    }
    if (data.constraints) updatePayload.constraints = data.constraints
    if (data.notes !== undefined) updatePayload.notes = data.notes ?? null

    await ride.merge(updatePayload).save()
    return response.ok(ride.serialize())
  }

  async destroy({ auth, params, response }: HttpContext) {
    const driver = auth.getUserOrFail()
    const ride = await Ride.findOrFail(params.id)

    if (ride.driverId !== driver.id) {
      return response.forbidden({ message: 'Vous n\'êtes pas le conducteur de ce trajet' })
    }

    if (['CANCELLED', 'COMPLETED'].includes(ride.status)) {
      return response.unprocessableEntity({ message: 'Ce trajet est déjà terminé ou annulé' })
    }

    // Load event for notification
    await ride.load('event')

    // Cancel all confirmed bookings
    const confirmedBookings = await Booking.query()
      .where('rideId', ride.id)
      .whereIn('status', ['PENDING', 'CONFIRMED'])

    await Booking.query()
      .where('rideId', ride.id)
      .whereIn('status', ['PENDING', 'CONFIRMED'])
      .update({
        status: 'CANCELLED',
        cancelledBy: driver.id,
        cancelledAt: DateTime.now().toSQL(),
        cancelReason: 'Conducteur a annulé le trajet',
      })

    await ride.merge({ status: 'CANCELLED' }).save()

    // Notify passengers asynchronously
    for (const booking of confirmedBookings) {
      NotificationService.notifyRideCancelled(booking.passengerId, ride.event.name).catch(() => {})
    }

    return response.ok({ message: 'Trajet annulé' })
  }
}
