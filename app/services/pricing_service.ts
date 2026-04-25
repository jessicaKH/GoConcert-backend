import env from '#start/env'

const BASE_RATE_PER_KM = () => env.get('BASE_RATE_PER_KM') ?? 0.08
const MIN_PRICE = () => env.get('MIN_PRICE_EUR') ?? 2.0
const MAX_PRICE_CAP = () => env.get('MAX_PRICE_EUR') ?? 50.0
const COMMISSION_RATE = () => env.get('COMMISSION_RATE') ?? 0.1

export default class PricingService {
  static haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371
    const dLat = ((lat2 - lat1) * Math.PI) / 180
    const dLng = ((lng2 - lng1) * Math.PI) / 180
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  }

  static estimatePrice(distanceKm: number): { min: number; max: number } {
    const base = distanceKm * BASE_RATE_PER_KM()
    return {
      min: Math.max(MIN_PRICE(), Math.round(base * 0.8 * 2) / 2),
      max: Math.min(MAX_PRICE_CAP(), Math.round(base * 1.2 * 2) / 2),
    }
  }

  static validatePriceInRange(price: number, min: number, max: number): boolean {
    return price >= min && price <= max
  }

  static calculateCommission(totalPrice: number): number {
    return Math.round(totalPrice * COMMISSION_RATE() * 100) / 100
  }
}
