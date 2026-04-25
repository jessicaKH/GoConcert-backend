# GoConcert — Module Ticketmaster

> Ce document décrit l'intégration complète de l'API Ticketmaster pour GoConcert.  
> Stack : AdonisJS 6 + TypeScript · Prisma · PostgreSQL

---

## Contexte & particularités

GoConcert utilise l'**API interne** de Ticketmaster (celle utilisée par leur propre site), et non l'API officielle `developers.ticketmaster.com`.

Points critiques :
- Pas de clé API officielle — paramètre `idTiers=78768` obligatoire dans toutes les URLs
- L'adresse complète d'un événement n'est disponible **que** sur l'endpoint de détail `/manifestations/{id}`, protégé par un cookie de session `tmpt`
- Ce cookie est obtenu via Puppeteer (navigateur headless) qui visite `ticketmaster.fr`
- La pagination TM est **0-indexed** (`page=0` pour la première page)
- `urlImage` est toujours un chemin relatif — préfixer avec `https://www.ticketmaster.fr`
- `external_id` stocké avec préfixe `tm_` (ex: `tm_123456`) → pour les appels API : `.slice(3)` → `123456`

---

## Dépendances npm

```json
{
  "puppeteer-core": "^24.29.0",
  "puppeteer-extra": "^3.3.6",
  "puppeteer-extra-plugin-stealth": "^2.11.2",
  "got": "^14.4.7"
}
```

> `@adonisjs/cache` est remplacé par une solution de cache maison (Map en mémoire + TTL) compatible avec Prisma/AdonisJS 6, décrite ci-dessous.

---

## Variables d'environnement

```env
BROWSERLESS_URL=wss://chrome.browserless.io
BROWSERLESS_TOKEN=                          # Ajouté en ?token= à BROWSERLESS_URL
DISCORD_WEBHOOK_URL=                        # Notifications de rotation cookie
```

> `TICKETMASTER_API_KEY` n'est pas utilisé.

---

## Architecture du module

```
app/
├── controllers/
│   ├── events_controller.ts         # Routes publiques événements
│   └── ticketmaster_admin_controller.ts  # Routes admin (cookie)
├── services/
│   ├── ticketmaster_service.ts      # Orchestration principale
│   ├── cookie_rotation_service.ts   # Gestion Puppeteer + cookie tmpt
│   ├── ticketmaster_cache_service.ts# Cache L1 mémoire (Map + TTL)
│   └── discord_service.ts           # Notifications webhook
├── dtos/
│   └── ticketmaster/
│       ├── tm_search_item.dto.ts    # Réponse /search et /advanced-search
│       ├── tm_best_seller.dto.ts    # Réponse /best-sellers
│       ├── tm_event_detail.dto.ts   # Réponse /manifestations/{id}
│       └── event_response.dto.ts    # DTO de sortie vers le frontend
└── utils/
    └── tm_utils.ts                  # Données statiques villes + fonctions géo
```

---

## DTOs

### `TmSearchItemDto` — Réponse des endpoints de liste

```typescript
// app/dtos/ticketmaster/tm_search_item.dto.ts

export interface TmSearchItemDto {
  id: number
  title: string
  startDate: string        // ISO 8601
  endDate: string
  city: string
  cityId: number
  place: string            // nom du lieu/venue
  urlImage: string         // chemin relatif → préfixer avec https://www.ticketmaster.fr
  price: number
  genre: string
  status: string
}

export interface TmSearchResponseDto {
  content: TmSearchItemDto[]
  totalElements: number
  totalPages: number
  number: number           // page courante (0-indexed)
  size: number
  last: boolean
  first: boolean
  empty: boolean
}
```

---

### `TmBestSellerDto` — Réponse /best-sellers

```typescript
// app/dtos/ticketmaster/tm_best_seller.dto.ts

export interface TmBestSellerDto {
  rank: number
  idManif: number
  title: string
  image: string            // chemin relatif
  llgLieu: string          // nom du lieu
  llgville: string
  llgregion: string
  debManif: string         // date début
  finManif: string         // date fin
}
```

---

### `TmEventDetailDto` — Réponse /manifestations/{id}

```typescript
// app/dtos/ticketmaster/tm_event_detail.dto.ts

export interface TmEventDetailDto {
  idmanif: number
  name: string
  location: string         // nom du lieu (→ venue dans notre DB)
  ville: string
  startDate: string        // ISO 8601
  endDate: string
  address1: string         // rue principale (→ address dans notre DB)
  address2: string
  address3: string
  zipCode: string
  country: string
  cityId: number           // utilisé pour résoudre lat/lng via tmUtils
  urlImage: string         // chemin relatif
  price: number
  priceMax: number
}
```

---

### `EventResponseDto` — DTO de sortie vers le frontend

```typescript
// app/dtos/ticketmaster/event_response.dto.ts

export interface EventResponseDto {
  id: string                // external_id (ex: "tm_123456")
  name: string
  venueName: string
  venueAddress: string
  city: string
  country: string
  latitude: number
  longitude: number
  startsAt: string          // ISO 8601 UTC
  imageUrl: string | null
  genre: string | null
  url: string | null        // Lien ticketmaster.fr vers la fiche événement
  ridesCount: number        // Injecté par EventsController
  hasActiveAlert: boolean   // Injecté si user authentifié
}

export interface EventListResponseDto {
  data: EventResponseDto[]
  meta: {
    total: number
    page: number
    limit: number
  }
}
```

---

## API Ticketmaster — Endpoints utilisés

**Base URL** : `https://www.ticketmaster.fr/api`  
**Paramètre obligatoire** : `idTiers=78768` dans toutes les URLs.

---

### Endpoint 1 — Recherche textuelle

Libre d'accès, pas de cookie.

```
GET /api/search?term={query}&page={page}&size={size}&sort=pertinence,desc&idTiers=78768&cpn=0
```

Réponse : `TmSearchResponseDto`

---

### Endpoint 2 — Recherche avancée avec filtres géographiques

Libre d'accès, pas de cookie.

```
POST /api/search/advanced-search?page={page}&size={size}&sort=nouveaute,desc&sort=date.gte,asc&idTiers=78768&cpn=0
Content-Type: application/json
```

Body :
```json
{
  "regionIds": [],
  "cityIds": [12, 34, 56],
  "codGenre": ["CO", "FE"],
  "codSsGenre": [],
  "promotion": null,
  "promotionCpn": null,
  "siteIds": [],
  "population": null
}
```

- `codGenre` : `"CO"` = concert, `"FE"` = festival
- `cityIds` : IDs internes TM, obtenus via `tmUtils.getCitiesInRadius()`

Réponse : `TmSearchResponseDto`

---

### Endpoint 3 — Best-sellers par genre

Libre d'accès, pas de cookie.

```
GET /api/best-sellers/GENRES/CO    // concerts
GET /api/best-sellers/GENRES/FE    // festivals
```

Réponse : `TmBestSellerDto[]`

---

### Endpoint 4 — Détail d'un événement ⚠️ Cookie requis

**Seul endpoint qui retourne l'adresse complète.**

```
GET /api/manifestations/{id}?responseGroup=ManifestationDetailDto&idTiers=78768&codlang=FR&userCountry=FR
Cookie: tmpt={cookie_value}
```

> `{id}` = ID numérique TM sans préfixe. Si `external_id = "tm_123456"` → `id = "123456"` (`.slice(3)`)

Réponse : `TmEventDetailDto`

---

## Système de cookie `tmpt`

### Stockage

Cookie stocké en mémoire statique dans `TicketmasterService` :

```typescript
class TicketmasterService {
  private static tmptCookie: string = ''

  static setTmptCookie(value: string): void {
    this.tmptCookie = value
  }
  static getTmptCookie(): string {
    return this.tmptCookie
  }
}
```

⚠️ Le cookie est **perdu à chaque redémarrage**. Il sera regénéré automatiquement au premier appel échoué, ou injecté manuellement via `POST /admin/ticketmaster/cookie`.

---

### `fetchWithCookieRotation<T>(url, errorContext, fetchOptions?)`

Wrapper utilisé pour tous les appels nécessitant le cookie :

```typescript
async function fetchWithCookieRotation<T>(
  url: string,
  errorContext: string,
  fetchOptions?: RequestInit
): Promise<T> {
  // 1. Ajouter le cookie si présent
  const cookie = TicketmasterService.getTmptCookie()
  const headers: Record<string, string> = {
    ...(fetchOptions?.headers as Record<string, string>),
    ...(cookie ? { Cookie: `tmpt=${cookie}` } : {}),
  }

  // 2. Premier appel
  const res = await fetch(url, { ...fetchOptions, headers })

  if (res.ok) return res.json() as Promise<T>

  // 3. Échec → rotation
  const rotated = await CookieRotationService.rotateCookie()
  if (!rotated) {
    await DiscordService.notifyApiError(errorContext, 'Rotation échouée')
    throw new Error(`[Ticketmaster] ${errorContext} — rotation échouée`)
  }

  // 4. Retry avec nouveau cookie
  const newCookie = TicketmasterService.getTmptCookie()
  const retryHeaders = { ...headers, Cookie: `tmpt=${newCookie}` }
  const retryRes = await fetch(url, { ...fetchOptions, headers: retryHeaders })

  if (retryRes.ok) return retryRes.json() as Promise<T>

  await DiscordService.notifyApiError(errorContext, `HTTP ${retryRes.status}`)
  throw new Error(`[Ticketmaster] ${errorContext} — échec après rotation`)
}
```

---

### `CookieRotationService.rotateCookie()`

**Guard de concurrence** : une seule rotation à la fois.

```typescript
class CookieRotationService {
  private static isRotating = false

  static async rotateCookie(): Promise<boolean> {
    if (this.isRotating) return false
    this.isRotating = true

    try {
      const wsEndpoint = `${Env.get('BROWSERLESS_URL')}?token=${Env.get('BROWSERLESS_TOKEN')}`
      const browser = await puppeteer.connect({ browserWSEndpoint: wsEndpoint })
      const page = await browser.newPage()

      let tmptCookie = ''

      await page.setRequestInterception(true)

      // Intercepter le cookie dans les headers de requête
      page.on('request', (req) => {
        const cookieHeader = req.headers()['cookie'] || ''
        const match = cookieHeader.match(/tmpt=([^;]+)/)
        if (match) tmptCookie = match[1]
        req.continue()
      })

      // Intercepter le Set-Cookie dans les réponses
      page.on('response', (res) => {
        const setCookie = res.headers()['set-cookie'] || ''
        const match = setCookie.match(/tmpt=([^;]+)/)
        if (match) tmptCookie = match[1]
      })

      await page.goto('https://www.ticketmaster.fr', {
        waitUntil: 'networkidle2',
        timeout: 30000,
      })

      // ⚠️ TM dépose le cookie via JS — attente obligatoire
      await new Promise((resolve) => setTimeout(resolve, 8000))

      page.removeAllListeners()

      // Fallback : lire les cookies du navigateur
      if (!tmptCookie) {
        const cookies = await page.cookies()
        tmptCookie = cookies.find((c) => c.name === 'tmpt')?.value || ''
      }

      await browser.close()

      if (tmptCookie) {
        TicketmasterService.setTmptCookie(tmptCookie)
        await DiscordService.notifyRotationSuccess(tmptCookie)
        return true
      }

      await DiscordService.notifyRotationFailure('Cookie tmpt introuvable')
      return false
    } catch (error) {
      await DiscordService.notifyRotationFailure(error.message)
      return false
    } finally {
      this.isRotating = false
    }
  }
}

// Setup stealth (en haut du fichier, avant toute utilisation)
import puppeteerExtra from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
const puppeteer = puppeteerExtra.default ?? puppeteerExtra
puppeteer.use(StealthPlugin())
```

---

## Cache (`TicketmasterCacheService`)

Cache L1 en mémoire (Map + TTL 5 minutes pour GoConcert — appels temps réel).

```typescript
class TicketmasterCacheService {
  private static store = new Map<string, { value: unknown; expiresAt: number }>()
  private static TTL_MS = 5 * 60 * 1000 // 5 minutes

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
    this.store.set(key, { value, expiresAt: Date.now() + this.TTL_MS })
  }
}
```

**Clés de cache :**

| Clé | Endpoint |
|-----|----------|
| `tm:search:{query}:{page}:{size}` | `GET /search` |
| `tm:advanced:{page}:{size}:{hash_du_body}` | `POST /advanced-search` |
| `tm:bestsellers:CO` | `GET /best-sellers/GENRES/CO` |
| `tm:bestsellers:FE` | `GET /best-sellers/GENRES/FE` |
| `tm:detail:{externalId}` | `GET /manifestations/{id}` |

> Le détail d'un événement n'est mis en cache que s'il est déjà persisté en DB (voir Flux B).

---

## Flux de récupération

### Flux A — Liste (pas de persistance)

Pour `GET /events`, `GET /events/nearby`, `GET /events/search`, `GET /events/popular`.

```
1. Construire la clé de cache selon les paramètres
2. Cache hit → retourner immédiatement
3. Cache miss :
   a. Appel TM selon le type de recherche :
      - texte      → GET /search?term=...
      - géo        → getCitiesInRadius() → POST /advanced-search { cityIds }
      - populaires → GET /best-sellers/GENRES/CO + GENRES/FE
   b. Filtrer les événements passés (startDate > now())
   c. Pour chaque TmSearchItemDto → mapper vers EventResponseDto (sans adresse)
   d. Enrichir avec ridesCount depuis la DB (WHERE event_id IN (...))
   e. Si user authentifié → injecter hasActiveAlert
   f. Mettre en cache + retourner
```

### Flux B — Détail (persistance + adresse complète)

Pour `GET /events/:id` — déclenche Puppeteer si besoin.

```
1. Chercher en DB : prisma.event.findUnique({ where: { ticketmasterId } })
   → Si trouvé → mapper vers EventResponseDto + enrichir rides + alerte → retourner

2. Si non trouvé et external_id commence par 'tm_' :
   a. fetchWithCookieRotation(
        GET /api/manifestations/{id.slice(3)}?responseGroup=ManifestationDetailDto&...
      )
   b. Résoudre lat/lng :
        getCityByCityId(detail.cityId) → city.slug → getCoordByUrl(slug) → { lat, lng }
   c. prisma.event.create({
        id            : 'tm_' + detail.idmanif,
        ticketmasterId: String(detail.idmanif),
        name          : detail.name,
        venueName     : detail.location,
        venueAddress  : [detail.address1, detail.zipCode, detail.ville].filter(Boolean).join(', '),
        city          : detail.ville,
        country       : detail.country || 'FR',
        latitude      : coord.lat,
        longitude     : coord.lng,
        startsAt      : new Date(detail.startDate),
        imageUrl      : 'https://www.ticketmaster.fr' + detail.urlImage,
      })
   d. Mapper + enrichir + retourner
```

---

## Utilitaires géographiques (`tmUtils.ts`)

Données statiques françaises (~3966 lignes) : mapping coordonnées GPS ↔ IDs de villes TM internes.

### Interfaces

```typescript
interface TmCity {
  id: number
  cityIds: number[]       // IDs internes TM (plusieurs possibles par ville)
  idRattachement: number
  label: string
  slug: string            // lien avec les coordonnées GPS
}

interface TmCoord {
  city: string
  lat: number
  lng: number
  url: string             // correspond au slug dans TmCity
}
```

### Fonctions exposées

```typescript
// Toutes les villes dans un rayon donné (Haversine)
getCitiesInRadius(lat: number, lng: number, radiusKm: number): TmCity[]

// Ville TM la plus proche d'un point
getClosestCity(lat: number, lng: number, maxRadiusKm?: number): TmCity | null

// Lookup par ID TM interne
getCityByCityId(cityId: number): TmCity | null

// Coordonnées GPS depuis slug de ville
getCoordByUrl(url: string): TmCoord | null
```

**Usage typique** (recherche géo → `cityIds` pour `advanced-search`) :
```typescript
const cities = getCitiesInRadius(lat, lng, radiusKm)
const cityIds = cities.flatMap((city) => city.cityIds)
// → passer cityIds dans le body de POST /advanced-search
```

---

## Mapping vers `EventResponseDto`

```typescript
// TmSearchItemDto → EventResponseDto (liste, sans adresse)
function mapSearchItemToDto(item: TmSearchItemDto): Partial<EventResponseDto> {
  return {
    id        : `tm_${item.id}`,
    name      : item.title,
    venueName : item.place,
    city      : item.city,
    startsAt  : item.startDate,
    imageUrl  : item.urlImage ? `https://www.ticketmaster.fr${item.urlImage}` : null,
    genre     : item.genre,
    // venueAddress, latitude, longitude → disponibles seulement après Flux B
  }
}

// Prisma Event → EventResponseDto (complet)
function mapDbEventToDto(event: PrismaEvent, ridesCount: number, hasActiveAlert: boolean): EventResponseDto {
  return {
    id            : event.id,
    name          : event.name,
    venueName     : event.venueName,
    venueAddress  : event.venueAddress,
    city          : event.city,
    country       : event.country,
    latitude      : event.latitude,
    longitude     : event.longitude,
    startsAt      : event.startsAt.toISOString(),
    imageUrl      : event.imageUrl,
    genre         : event.genre,
    url           : `https://www.ticketmaster.fr/manifestation/${event.ticketmasterId}`,
    ridesCount,
    hasActiveAlert,
  }
}
```

---

## Routes HTTP exposées

### Routes publiques (EventsController)

| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/api/v1/events` | Liste avec filtres (query, lat/lng/radius, genre, dates) |
| `GET` | `/api/v1/events/nearby` | Alias géo : `?lat=&lng=&radius=&page=&size=` |
| `GET` | `/api/v1/events/popular` | Best-sellers TM (CO + FE) |
| `GET` | `/api/v1/events/search` | Recherche textuelle : `?query=&page=&size=` |
| `GET` | `/api/v1/events/:id` | Détail + persistance (déclenche Puppeteer si besoin) |
| `GET` | `/api/v1/events/:id/rides` | Trajets dispo pour un événement + bounding box |

### Routes admin (TicketmasterAdminController) — protégées

| Méthode | Route | Description |
|---------|-------|-------------|
| `POST` | `/api/v1/admin/ticketmaster/cookie` | Injecter manuellement le cookie `tmpt` |
| `GET` | `/api/v1/admin/ticketmaster/cookie` | Lire le cookie `tmpt` actuel (masqué sauf 30 premiers chars) |

**POST /admin/ticketmaster/cookie**
```json
// Request
{ "cookie": "valeur_du_tmpt" }

// Response 200
{ "message": "Cookie updated", "preview": "abc123..." }
```

---

## Notifications Discord (`DiscordService`)

```typescript
class DiscordService {
  private static webhookUrl = Env.get('DISCORD_WEBHOOK_URL')

  static async notifyRotationSuccess(cookie: string): Promise<void> {
    await this.send({
      embeds: [{
        title : '✅ Rotation du cookie Ticketmaster réussie',
        color : 65280,
        fields: [{ name: 'Nouveau cookie', value: `tmpt=${cookie.slice(0, 50)}...` }],
      }],
    })
  }

  static async notifyRotationFailure(error: string): Promise<void> {
    await this.send({
      embeds: [{
        title : '❌ Échec de la rotation du cookie Ticketmaster',
        color : 16711680,
        fields: [{ name: 'Erreur', value: error }],
      }],
    })
  }

  static async notifyApiError(context: string, error: string): Promise<void> {
    await this.send({
      embeds: [{
        title : '🚨 Erreur Ticketmaster API',
        color : 16711680,
        fields: [
          { name: 'Contexte', value: context },
          { name: 'Erreur', value: error },
        ],
      }],
    })
  }

  private static async send(payload: object): Promise<void> {
    await fetch(this.webhookUrl, {
      method  : 'POST',
      headers : { 'Content-Type': 'application/json' },
      body    : JSON.stringify(payload),
    }).catch(() => {}) // Ne pas faire planter l'app si Discord est down
  }
}
```

---

## Points d'attention ⚠️

### Cookie perdu au redémarrage
`tmptCookie` est en mémoire statique. En production, envisager de le persister en DB ou Redis pour éviter un Puppeteer inutile au premier appel après redémarrage.

### Guard de concurrence
Si plusieurs requêtes échouent simultanément, seule la première déclenche la rotation. Les autres reçoivent `false` immédiatement et vont throw. Leur appelant doit renvoyer une erreur 503 propre au lieu de crasher.

### Adresse incomplète en liste
Les endpoints de liste (Flux A) ne retournent pas `venueAddress`, `latitude`, `longitude`. Ces champs ne sont peuplés qu'après le Flux B (premier appel du détail). Le frontend doit gérer cet état partiel.

### Puppeteer en environnement cloud
L'instance Puppeteer doit être **distante** (Browserless.io ou équivalent) — ne pas faire tourner Chromium sur le serveur AdonisJS. `BROWSERLESS_URL` est obligatoire en production.

### Filtrer les événements passés
L'API TM retourne parfois des événements dont la date est dépassée. Toujours filtrer `startDate > now()` côté serveur avant de retourner les listes.

### `cityIds` est un tableau
Chaque ville TM peut avoir plusieurs IDs internes. Utiliser `.flatMap(city => city.cityIds)` et non `.map(city => city.cityIds[0])`.

### Images CORS
Si le frontend charge les images directement depuis `ticketmaster.fr`, des problèmes CORS peuvent survenir sur certains clients. Envisager un proxy d'images (`/proxy-image?url=...`) si nécessaire.
