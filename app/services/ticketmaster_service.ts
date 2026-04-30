import TicketmasterCacheService from '#services/ticketmaster_cache_service'
import CookieRotationService from '#services/cookie_rotation_service'
import DiscordService from '#services/discord_service'
import type { TmSearchResponseDto } from '#dtos/ticketmaster/tm_search_item.dto'
import type { TmBestSellerDto } from '#dtos/ticketmaster/tm_best_seller.dto'
import type { TmEventDetailDto } from '#dtos/ticketmaster/tm_event_detail.dto'
import { getCitiesInRadius } from '#utils/tm_utils'

const BASE_URL = 'https://www.ticketmaster.fr/api'
const TIERS_ID = '78768'

export default class TicketmasterService {
  private static tmptCookie: string = ''

  static setTmptCookie(value: string): void {
    this.tmptCookie = value
  }

  static getTmptCookie(): string {
    return this.tmptCookie
  }

  // ─── Endpoints publics (pas de cookie) ────────────────────────────────────

  static async searchByQuery(
    query: string,
    page = 0,
    size = 20
  ): Promise<TmSearchResponseDto> {
    const cacheKey = `tm:search:${query}:${page}:${size}`
    const cached = TicketmasterCacheService.get<TmSearchResponseDto>(cacheKey)
    if (cached) return cached

    const url = `${BASE_URL}/search?term=${encodeURIComponent(query)}&page=${page}&size=${size}&sort=pertinence,desc&idTiers=${TIERS_ID}&cpn=0`
    const data = await this.fetchPublic<TmSearchResponseDto>(url, 'searchByQuery')
    TicketmasterCacheService.set(cacheKey, data)
    return data
  }

  static async searchAdvanced(
    lat: number,
    lng: number,
    radiusKm: number,
    genres: string[] = ['CO', 'FE'],
    page = 0,
    size = 20
  ): Promise<TmSearchResponseDto> {
    const cities = getCitiesInRadius(lat, lng, radiusKm)
    const cityIds = cities.flatMap((c) => c.cityIds)

    const body = {
      regionIds: [],
      cityIds,
      codGenre: genres,
      codSsGenre: [],
      promotion: null,
      promotionCpn: null,
      siteIds: [],
      population: null,
    }

    const bodyHash = Buffer.from(JSON.stringify(body)).toString('base64').slice(0, 16)
    const cacheKey = `tm:advanced:${page}:${size}:${bodyHash}`
    const cached = TicketmasterCacheService.get<TmSearchResponseDto>(cacheKey)
    if (cached) return cached

    const url = `${BASE_URL}/search/advanced-search?page=${page}&size=${size}&sort=nouveaute,desc&sort=date.gte,asc&idTiers=${TIERS_ID}&cpn=0`
    const data = await this.fetchPublic<TmSearchResponseDto>(url, 'searchAdvanced', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    TicketmasterCacheService.set(cacheKey, data)
    return data
  }

  static async getBestSellers(genre: 'CO' | 'FE'): Promise<TmBestSellerDto[]> {
    const cacheKey = `tm:bestsellers:${genre}`
    const cached = TicketmasterCacheService.get<TmBestSellerDto[]>(cacheKey)
    if (cached) return cached

    const url = `${BASE_URL}/best-sellers/GENRES/${genre}`
    const data = await this.fetchPublic<TmBestSellerDto[]>(url, `bestSellers:${genre}`)
    TicketmasterCacheService.set(cacheKey, data)
    return data
  }

  // ─── Endpoint détail (cookie requis) ──────────────────────────────────────

  static async getEventDetail(tmId: string): Promise<TmEventDetailDto> {
    const cacheKey = `tm:detail:${tmId}`
    const cached = TicketmasterCacheService.get<TmEventDetailDto>(cacheKey)
    if (cached) return cached

    const numericId = tmId.startsWith('tm_') ? tmId.slice(3) : tmId
    const url = `${BASE_URL}/manifestations/idmanif/${numericId}?responseGroup=ManifestationDetailDto&idTiers=${TIERS_ID}&codlang=FR&userCountry=FR&codCoMod=WEB`
    const data = await this.fetchWithCookieRotation<TmEventDetailDto>(url, `getEventDetail:${tmId}`)

    TicketmasterCacheService.set(cacheKey, data)
    return data
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private static async fetchPublic<T>(
    url: string,
    context: string,
    options?: RequestInit
  ): Promise<T> {
    const res = await fetch(url, options)
    if (!res.ok) {
      await DiscordService.notifyApiError(context, `HTTP ${res.status}`)
      throw new Error(`[Ticketmaster] ${context} — HTTP ${res.status}`)
    }
    return res.json() as Promise<T>
  }

  private static async fetchWithCookieRotation<T>(
    url: string,
    context: string,
    options?: RequestInit
  ): Promise<T> {
    const buildHeaders = (cookie: string) => ({
      ...(options?.headers as Record<string, string>),
      ...(cookie ? { Cookie: `tmpt=${cookie}` } : {}),
    })

    const res = await fetch(url, { ...options, headers: buildHeaders(this.tmptCookie) })
    if (res.ok) return res.json() as Promise<T>

    const rotated = await CookieRotationService.rotateCookie()
    if (!rotated) {
      await DiscordService.notifyApiError(context, 'Rotation échouée')
      throw new Error(`[Ticketmaster] ${context} — rotation échouée`)
    }

    const retryRes = await fetch(url, { ...options, headers: buildHeaders(this.tmptCookie) })
    if (retryRes.ok) return retryRes.json() as Promise<T>

    await DiscordService.notifyApiError(context, `HTTP ${retryRes.status} après rotation`)
    throw new Error(`[Ticketmaster] ${context} — échec après rotation`)
  }

  static filterFutureEvents<T extends { startDate?: string; startsAt?: string }>(items: T[]): T[] {
    const now = Date.now()
    return items.filter((item) => {
      const date = item.startDate ?? item.startsAt
      return date ? new Date(date).getTime() > now : true
    })
  }
}
