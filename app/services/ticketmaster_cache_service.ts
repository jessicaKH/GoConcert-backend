const TTL_MS = 5 * 60 * 1000 // 5 minutes

export default class TicketmasterCacheService {
  private static store = new Map<string, { value: unknown; expiresAt: number }>()

  static get<T>(key: string): T | null {
    const entry = this.store.get(key)
    if (!entry) return null
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key)
      return null
    }
    return entry.value as T
  }

  static set<T>(key: string, value: T): void {
    this.store.set(key, { value, expiresAt: Date.now() + TTL_MS })
  }

  static delete(key: string): void {
    this.store.delete(key)
  }

  static clear(): void {
    this.store.clear()
  }
}
