import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import Event from '#models/event'
import Ride from '#models/ride'
import Alert from '#models/alert'
import TicketmasterService from '#services/ticketmaster_service'
import MapsService from '#services/maps_service'
import { getCoordByUrl, getCityByCityId } from '#utils/tm_utils'
import type { EventResponseDto } from '#dtos/ticketmaster/event_response.dto'
import type { TmSearchItemDto } from '#dtos/ticketmaster/tm_search_item.dto'
import type { TmBestSellerDto } from '#dtos/ticketmaster/tm_best_seller.dto'

function mapSearchItemToDto(item: TmSearchItemDto): Partial<EventResponseDto> {
  return {
    id: `tm_${item.id}`,
    name: item.title,
    venueName: item.place,
    venueAddress: null,
    city: item.city,
    country: null,
    latitude: null,
    longitude: null,
    startsAt: item.startDate,
    imageUrl: item.urlImage ? `https://www.ticketmaster.fr/${item.urlImage}` : null,
    genre: item.genre,
    url: null,
    ridesCount: 0,
    hasActiveAlert: null,
  }
}

function mapBestSellerToDto(item: TmBestSellerDto): Partial<EventResponseDto> {
  return {
    id: `tm_${item.idManif}`,
    name: item.title,
    venueName: item.llgLieu,
    venueAddress: null,
    city: item.llgville,
    country: null,
    latitude: null,
    longitude: null,
    startsAt: item.debManif,
    imageUrl: item.image ? `https://www.ticketmaster.fr/${item.image}` : null,
    genre: null,
    url: null,
    ridesCount: 0,
    hasActiveAlert: null,
  }
}

function mapDbEventToDto(
  event: Event,
  ridesCount: number,
  hasActiveAlert: boolean | null
): EventResponseDto {
  return {
    id: event.id,
    name: event.name,
    venueName: event.venueName,
    venueAddress: event.venueAddress,
    city: event.city,
    country: event.country,
    latitude: event.latitude,
    longitude: event.longitude,
    startsAt: event.startsAt.toISO()!,
    imageUrl: event.imageUrl,
    genre: event.genre,
    url: event.url ?? `https://www.ticketmaster.fr/manifestation/${event.ticketmasterId}`,
    ridesCount,
    hasActiveAlert,
  }
}

async function enrichWithRidesCounts(eventIds: string[]): Promise<Record<string, number>> {
  if (eventIds.length === 0) return {}

  const counts = await Ride.query()
    .whereIn('eventId', eventIds)
    .where('status', 'ACTIVE')
    .groupBy('eventId')
    .count('* as count')
    .select('eventId')

  return Object.fromEntries(counts.map((r: any) => [r.eventId, Number(r.$extras?.count ?? r.count ?? 0)]))
}

export default class EventsController {
  async index({ auth, request, response }: HttpContext) {
    const query = request.input('query')
    const lat = Number(request.input('lat'))
    const lng = Number(request.input('lng'))
    const radius = Number(request.input('radius', 50))
    const genre = request.input('genre')
    const page = Math.max(0, Number(request.input('page', 1)) - 1)
    const limit = Number(request.input('limit', 20))

    let items: Partial<EventResponseDto>[] = []
    let total = 0

    if (query) {
      const data = await TicketmasterService.searchByQuery(query, page, limit)
      const filtered = TicketmasterService.filterFutureEvents(data.content)
      items = filtered.map(mapSearchItemToDto)
      total = data.totalElements
    } else if (lat && lng) {
      const genres = genre ? [genre] : ['CO', 'FE']
      const data = await TicketmasterService.searchAdvanced(lat, lng, radius, genres, page, limit)
      const filtered = TicketmasterService.filterFutureEvents(data.content)
      items = filtered.map(mapSearchItemToDto)
      total = data.totalElements
    } else {
      const [concerts, festivals] = await Promise.all([
        TicketmasterService.getBestSellers('CO'),
        TicketmasterService.getBestSellers('FE'),
      ])
      const now = Date.now()
      const combined = [...concerts, ...festivals].filter(
        (item) => !item.debManif || new Date(item.debManif).getTime() > now
      )
      items = combined.map(mapBestSellerToDto)
      total = items.length
    }

    const eventIds = items.map((i) => i.id!).filter(Boolean)
    const rideCounts = await enrichWithRidesCounts(eventIds)

    const user = auth.user
    let alertMap: Record<string, boolean> = {}

    if (user) {
      const alerts = await Alert.query()
        .whereIn('eventId', eventIds)
        .where('userId', user.id)
        .where('isActive', true)
        .select('eventId')

      alertMap = Object.fromEntries(alerts.map((a) => [a.eventId, true]))
    }

    const enriched = items.map((item) => ({
      ...item,
      ridesCount: rideCounts[item.id!] ?? 0,
      hasActiveAlert: user ? (alertMap[item.id!] ?? false) : null,
    }))

    return response.ok({
      data: enriched,
      meta: { total, page: page + 1, limit },
    })
  }

  async show({ auth, params, response }: HttpContext) {
    const eventId = params.id as string

    let event = await Event.find(eventId)

    if (!event && eventId.startsWith('tm_')) {
      const detail = await TicketmasterService.getEventDetail(eventId)
      const city = getCityByCityId(detail.cityId)
      const coord = city ? getCoordByUrl(city.slug) : null

      event = await Event.create({
        id: `tm_${detail.idmanif}`,
        ticketmasterId: String(detail.idmanif),
        name: detail.name,
        venueName: detail.location,
        venueAddress: [detail.address1, detail.zipCode, detail.ville].filter(Boolean).join(', '),
        city: detail.ville,
        country: detail.country || 'FR',
        latitude: coord?.lat ?? 0,
        longitude: coord?.lng ?? 0,
        startsAt: DateTime.fromISO(detail.startDate),
        imageUrl: detail.urlImage ? `https://www.ticketmaster.fr/${detail.urlImage}` : null,
        url: `https://www.ticketmaster.fr/manifestation/${detail.idmanif}`,
      })
    }

    if (!event) {
      return response.notFound({ message: 'Événement introuvable' })
    }

    const [ridesCountResult, user] = [
      await Ride.query()
        .where('eventId', event.id)
        .where('status', 'ACTIVE')
        .count('* as count')
        .first(),
      auth.user,
    ]

    const ridesCount = Number((ridesCountResult as any)?.$extras?.count ?? 0)

    let hasActiveAlert: boolean | null = null
    if (user) {
      const alert = await Alert.query()
        .where('eventId', event.id)
        .where('userId', user.id)
        .where('isActive', true)
        .first()
      hasActiveAlert = !!alert
    }

    return response.ok(mapDbEventToDto(event, ridesCount, hasActiveAlert))
  }

  async rides({ auth, params, request, response }: HttpContext) {
    const eventId = params.id as string
    const direction = request.input('direction', 'ALL') as 'OUTBOUND' | 'RETURN' | 'ALL'
    const minSeats = Number(request.input('minSeats', 1))

    const event = await Event.find(eventId)
    if (!event) {
      return response.notFound({ message: 'Événement introuvable' })
    }

    let ridesQuery = Ride.query()
      .where('eventId', eventId)
      .where('status', 'ACTIVE')
      .where('availableSeats', '>=', minSeats)
      .preload('driver')

    if (direction !== 'ALL') {
      ridesQuery = ridesQuery.where('direction', direction)
    }

    const rides = await ridesQuery.orderBy('departureTime', 'asc')

    const points = [
      { lat: event.latitude, lng: event.longitude },
      ...rides.map((r) => ({ lat: r.departureLat, lng: r.departureLng })),
    ]

    const boundingBox = MapsService.calculateBoundingBox(points)

    const user = auth.user
    let userRideForEvent = null
    let userAlertForEvent = null

    if (user) {
      const [userRide, userAlert] = await Promise.all([
        Ride.query()
          .where('driverId', user.id)
          .where('eventId', eventId)
          .where('status', 'ACTIVE')
          .first(),
        Alert.query()
          .where('userId', user.id)
          .where('eventId', eventId)
          .where('isActive', true)
          .first(),
      ])
      userRideForEvent = userRide?.serialize() ?? null
      userAlertForEvent = userAlert?.serialize() ?? null
    }

    const serializedRides = rides.map((ride) => ({
      id: ride.id,
      driver: {
        id: ride.driver.id,
        fullName: ride.driver.fullName,
        avatarUrl: ride.driver.avatarUrl,
        age: ride.driver.age,
        ratingAsDriver: ride.driver.ratingAsDriver,
        ridesAsDriverCount: ride.driver.ridesAsDriverCount,
        memberSince: ride.driver.memberSince,
        carModel: ride.driver.carModel,
        bio: ride.driver.bio,
      },
      direction: ride.direction,
      departureAddress: ride.departureAddress,
      departureLat: ride.departureLat,
      departureLng: ride.departureLng,
      departureTime: ride.departureTime.toISO(),
      estimatedArrival: ride.estimatedArrival?.toISO() ?? null,
      availableSeats: ride.availableSeats,
      pricePerSeat: ride.pricePerSeat,
      constraints: ride.constraints,
      notes: ride.notes,
      status: ride.status,
    }))

    return response.ok({
      event: {
        id: event.id,
        name: event.name,
        latitude: event.latitude,
        longitude: event.longitude,
      },
      boundingBox,
      rides: serializedRides,
      userRideForEvent,
      userAlertForEvent,
    })
  }
}
