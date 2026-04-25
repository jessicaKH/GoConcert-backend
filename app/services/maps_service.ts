import PricingService from '#services/pricing_service'

interface BoundingBox {
  northeast: { lat: number; lng: number }
  southwest: { lat: number; lng: number }
}

interface GeoPoint {
  lat: number
  lng: number
}

export default class MapsService {
  static getDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    return PricingService.haversineKm(lat1, lng1, lat2, lng2)
  }

  static calculateBoundingBox(points: GeoPoint[], defaultRadiusKm = 50): BoundingBox {
    if (points.length === 0) {
      throw new Error('At least one point required')
    }

    if (points.length === 1) {
      const [p] = points
      const degPerKm = defaultRadiusKm / 111
      return {
        northeast: { lat: p.lat + degPerKm, lng: p.lng + degPerKm },
        southwest: { lat: p.lat - degPerKm, lng: p.lng - degPerKm },
      }
    }

    const lats = points.map((p) => p.lat)
    const lngs = points.map((p) => p.lng)

    return {
      northeast: { lat: Math.max(...lats), lng: Math.max(...lngs) },
      southwest: { lat: Math.min(...lats), lng: Math.min(...lngs) },
    }
  }
}
