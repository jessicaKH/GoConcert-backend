# GoConcert — Backend Specification

**Version:** 1.2  
**Date:** 2026-04-25  
**Stack:** AdonisJS 6 + TypeScript · PostgreSQL · Lucid ORM · PostGIS

---

## 1. Vue d'ensemble du projet

GoConcert est une plateforme de covoiturage spécialisée pour les événements musicaux (concerts, festivals). Elle met en relation des conducteurs ayant des places disponibles avec des passagers se rendant au même événement.

### Principe d'accès public
**Toute la consultation est publique** (événements, trajets, profils conducteurs). L'authentification n'est requise qu'au moment d'une action : réserver, proposer un trajet, créer une alerte, laisser un avis. Un utilisateur non connecté qui tente une action reçoit un **401** — le frontend gère la redirection vers le flow d'auth.

### Objectifs clés du backend
- Exposer les événements musicaux via l'API Ticketmaster (appels temps réel)
- Gérer la création et la réservation de trajets de covoiturage (aller et/ou retour)
- Calculer automatiquement une fourchette de prix proportionnelle à la distance
- Envoyer des notifications push (iOS & Android) pour les alertes de disponibilité
- Appliquer une commission GoConcert sur chaque transaction
- Documenter toutes les routes via Swagger (OpenAPI 3.0)

---

## 2. Architecture

```
goconcert-backend/
├── app/
│   ├── controllers/
│   │   ├── auth_controller.ts
│   │   ├── events_controller.ts
│   │   ├── rides_controller.ts
│   │   ├── bookings_controller.ts
│   │   ├── alerts_controller.ts
│   │   ├── reviews_controller.ts
│   │   └── users_controller.ts
│   ├── services/
│   │   ├── ticketmaster_service.ts
│   │   ├── pricing_service.ts
│   │   ├── notification_service.ts
│   │   ├── payment_service.ts        # Stub
│   │   └── maps_service.ts
│   ├── middleware/
│   │   ├── auth_middleware.ts         # Bloque si non connecté → 401
│   │   ├── silent_auth_middleware.ts  # Auth optionnelle — injecte user si token présent, sinon null
│   │   └── throttle_middleware.ts
│   ├── validators/
│   └── exceptions/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── config/
├── tests/
│   ├── unit/
│   └── integration/
├── docs/
│   └── swagger.yaml
└── start/
    ├── routes.ts
    └── kernel.ts
```

### Décision : PostGIS

**Oui, PostGIS est nécessaire.** Il est utilisé pour :
- Stocker les points de départ des trajets (type `GEOGRAPHY(POINT)`)
- Calculer la bounding box de la carte sur l'écran concert
- Filtrer les conducteurs dans un rayon donné (alertes)
- Calculer les distances pour l'estimation de prix

---

## 3. Schéma de base de données (Lucid ORM)

Les modèles sont dans `app/models/`. Les migrations Lucid sont dans `database/migrations/`.
PostGIS est activé via migration SQL brute (`1777161600008_enable_postgis.ts`).

```
// Structure équivalente en Lucid — voir les modèles dans app/models/

model User {
  id            String    @id @default(uuid())
  email         String?   @unique
  phone         String?   @unique
  fullName      String
  avatarUrl     String?
  authProvider  AuthProvider
  providerId    String    @unique  // ID retourné par Google/Apple/OTP

  // Profil public conducteur
  birthDate     DateTime?  // Stocké brut — l'âge est calculé à la volée, jamais exposé directement
  bio           String?    // Courte description libre
  carModel      String?    // Ex: "Peugeot 308"

  // Notifications
  pushToken     String?
  platform      Platform?  // 'ios' | 'android'

  // Notation
  ratingAsDriver        Float?  @default(0)
  ratingAsPassenger     Float?  @default(0)
  ridesAsDriverCount    Int     @default(0)
  ridesAsPassengerCount Int     @default(0)

  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  ridesAsDriver    Ride[]     @relation("DriverRides")
  bookings         Booking[]
  alertsSet        Alert[]
  reviewsGiven     Review[]   @relation("ReviewAuthor")
  reviewsReceived  Review[]   @relation("ReviewTarget")
}

enum AuthProvider {
  GOOGLE
  APPLE
  PHONE_OTP
}

enum Platform {
  ios
  android
}

model Event {
  id              String   @id  // ID Ticketmaster (tm_xxxx)
  ticketmasterId  String   @unique
  name            String
  venueName       String
  venueAddress    String
  city            String
  country         String
  // Coordonnées stockées en PostGIS via migration brute sur la colonne 'location'
  // Ici on garde lat/lng pour Prisma, PostGIS géré en raw SQL
  latitude        Float
  longitude       Float
  startsAt        DateTime
  imageUrl        String?
  genre           String?
  url             String?  // Lien Ticketmaster pour achat billet

  cachedAt        DateTime @default(now())

  rides   Ride[]
  alerts  Alert[]
}

model Ride {
  id            String     @id @default(uuid())
  driverId      String
  driver        User       @relation("DriverRides", fields: [driverId], references: [id])
  eventId       String
  event         Event      @relation(fields: [eventId], references: [id])

  direction     RideDirection  // OUTBOUND (aller) | RETURN (retour)

  // Point de départ (lat/lng pour Prisma + colonne PostGIS gérée via raw SQL)
  departureLat      Float
  departureLng      Float
  departureAddress  String

  departureTime     DateTime
  estimatedArrival  DateTime?

  totalSeats        Int  // Défini par le conducteur
  availableSeats    Int

  // Prix
  pricePerSeat      Float  // Prix final fixé par le conducteur (dans la fourchette)
  minPrice          Float  // Calculé par le backend
  maxPrice          Float  // Calculé par le backend

  // Contraintes ("NO_SMOKING", "NO_PETS", "NO_FOOD", "NO_LUGGAGE", etc.)
  constraints       String[]

  notes             String?
  status            RideStatus @default(ACTIVE)

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  bookings  Booking[]
}

enum RideDirection {
  OUTBOUND
  RETURN
}

enum RideStatus {
  ACTIVE
  FULL
  CANCELLED
  COMPLETED
}

model Booking {
  id          String        @id @default(uuid())
  passengerId String
  passenger   User          @relation(fields: [passengerId], references: [id])
  rideId      String
  ride        Ride          @relation(fields: [rideId], references: [id])

  seatsBooked Int           @default(1)
  totalPrice  Float         // pricePerSeat * seatsBooked
  commission  Float         // Commission GoConcert (%)

  status      BookingStatus @default(PENDING)

  // Paiement (stub)
  paymentIntentId  String?
  paymentStatus    PaymentStatus @default(UNPAID)

  cancelledBy   String?   // userId
  cancelledAt   DateTime?
  cancelReason  String?

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  review  Review?
}

enum BookingStatus {
  PENDING
  CONFIRMED
  CANCELLED
  COMPLETED
}

enum PaymentStatus {
  UNPAID
  PAID
  REFUNDED
  PARTIALLY_REFUNDED
}

model Alert {
  id           String   @id @default(uuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id])
  eventId      String
  event        Event    @relation(fields: [eventId], references: [id])

  originLat    Float
  originLng    Float
  radiusKm     Float  // Rayon max pour rejoindre un conducteur

  direction    RideDirection  // Sur quel sens veut-il être alerté ?

  isActive     Boolean   @default(true)
  triggeredAt  DateTime? // Dernière notification envoyée

  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@unique([userId, eventId, direction])  // Une alerte par user/event/direction
}

model Review {
  id         String   @id @default(uuid())
  bookingId  String   @unique
  booking    Booking  @relation(fields: [bookingId], references: [id])

  authorId   String
  author     User     @relation("ReviewAuthor", fields: [authorId], references: [id])
  targetId   String
  target     User     @relation("ReviewTarget", fields: [targetId], references: [id])

  role       ReviewRole  // DRIVER_REVIEWING_PASSENGER | PASSENGER_REVIEWING_DRIVER
  rating     Int         // 1 à 5
  comment    String?

  createdAt  DateTime @default(now())

  @@unique([bookingId, authorId])
}

enum ReviewRole {
  DRIVER_REVIEWING_PASSENGER
  PASSENGER_REVIEWING_DRIVER
}
```

---

## 4. Routes API détaillées

### Base URL : `/api/v1`

### Légende accès
- **Public** : aucun token requis
- **Auth optionnelle** : token accepté si présent (via `silent_auth_middleware`) — enrichit la réponse avec l'état de l'utilisateur connecté
- **Auth requise** : token obligatoire, retourne 401 sinon

---

### 4.1 Authentification — `/auth`

| Méthode | Route | Description | Accès |
|---------|-------|-------------|-------|
| POST | `/auth/google` | Connexion via Google OAuth | Public |
| POST | `/auth/apple` | Connexion via Apple Sign-In | Public |
| POST | `/auth/otp/send` | Envoi OTP par SMS | Public |
| POST | `/auth/otp/verify` | Vérification OTP → retourne JWT | Public |
| POST | `/auth/refresh` | Rafraîchissement du token JWT | Public |
| POST | `/auth/logout` | Révocation du token | Auth requise |

**POST /auth/google**
```json
// Request
{ "idToken": "google_id_token_string" }

// Response 200
{
  "token": "jwt_access_token",
  "refreshToken": "jwt_refresh_token",
  "user": { "id": "uuid", "fullName": "...", "email": "..." }
}
```

---

### 4.2 Utilisateurs — `/users`

| Méthode | Route | Description | Accès |
|---------|-------|-------------|-------|
| GET | `/users/me` | Profil complet de l'utilisateur connecté | Auth requise |
| PUT | `/users/me` | Mise à jour du profil (bio, carModel, birthDate, etc.) | Auth requise |
| PUT | `/users/me/push-token` | Enregistrement du push token + platform | Auth requise |
| GET | `/users/me/bookings` | Historique des réservations | Auth requise |
| GET | `/users/me/rides` | Trajets proposés par l'utilisateur | Auth requise |
| GET | `/users/:id/profile` | Profil public d'un conducteur | Public |
| GET | `/users/:id/reviews` | Avis reçus par un utilisateur | Public |

**GET /users/:id/profile** — Profil public conducteur
```json
// Response 200
{
  "id": "uuid",
  "fullName": "Thomas D.",
  "avatarUrl": "https://...",
  "age": 28,
  "bio": "Ponctuel et musicophile !",
  "carModel": "Peugeot 308",
  "ratingAsDriver": 4.8,
  "ridesAsDriverCount": 34,
  "memberSince": "2025-03",
  "preferences": ["NO_SMOKING", "NO_FOOD"]
}
// ⛔ Jamais exposé : email, phone, pushToken, birthDate brut, providerId
```

**PUT /users/me/push-token**
```json
// Request
{ "pushToken": "ExponentPushToken[xxxxxx]", "platform": "ios" }

// Response 200
{ "message": "Push token updated successfully" }
```

---

### 4.3 Événements — `/events`

| Méthode | Route | Description | Accès |
|---------|-------|-------------|-------|
| GET | `/events` | Liste des événements (Ticketmaster) | Auth optionnelle |
| GET | `/events/:id` | Détail d'un événement | Auth optionnelle |
| GET | `/events/:id/rides` | Carte + trajets disponibles | Auth optionnelle |

> L'auth optionnelle injecte `hasActiveAlert` et `userRideForEvent` si l'utilisateur est connecté.

**GET /events** — Query params : `lat`, `lng`, `radius`, `query`, `genre`, `startDate`, `endDate`, `page`, `limit`, `sort`

```json
// Response 200
{
  "data": [
    {
      "id": "tm_Z7r9jZ1A7vkVn",
      "name": "Daft Punk Reunion Tour",
      "venueName": "Stade de France",
      "city": "Paris",
      "startsAt": "2026-06-15T20:00:00Z",
      "imageUrl": "https://...",
      "genre": "Electronic",
      "ridesCount": 12,
      "hasActiveAlert": null  // null si non connecté, bool si connecté
    }
  ],
  "meta": { "total": 150, "page": 1, "limit": 20 }
}
```

**GET /events/:id/rides** — Query params : `direction` (`OUTBOUND` | `RETURN` | `ALL`), `minSeats`

```json
// Response 200
{
  "event": { "id": "...", "name": "...", "latitude": 48.924, "longitude": 2.360 },
  "boundingBox": {
    "northeast": { "lat": 49.1, "lng": 2.6 },
    "southwest": { "lat": 48.6, "lng": 2.0 }
  },
  "rides": [
    {
      "id": "uuid",
      "driver": {
        "id": "uuid",
        "fullName": "Alice M.",
        "avatarUrl": "https://...",
        "age": 31,
        "ratingAsDriver": 4.8,
        "ridesAsDriverCount": 12,
        "memberSince": "2024-11",
        "carModel": "Renault Clio",
        "bio": "J'adore les festivals !"
      },
      "direction": "OUTBOUND",
      "departureAddress": "Porte de Versailles, Paris",
      "departureLat": 48.832,
      "departureLng": 2.289,
      "departureTime": "2026-06-15T18:30:00Z",
      "estimatedArrival": "2026-06-15T19:45:00Z",
      "availableSeats": 2,
      "pricePerSeat": 8.50,
      "constraints": ["NO_SMOKING", "NO_PETS"],
      "notes": "Coffre un peu petit !",
      "status": "ACTIVE"
    }
  ],
  "userRideForEvent": null,   // Objet ride si user connecté a déjà proposé, sinon null
  "userAlertForEvent": null   // Objet alert si user connecté a une alerte active, sinon null
}
```

---

### 4.4 Trajets — `/rides`

| Méthode | Route | Description | Accès |
|---------|-------|-------------|-------|
| POST | `/rides` | Créer un trajet | Auth requise |
| GET | `/rides/:id` | Détail complet + profil conducteur | Public |
| PUT | `/rides/:id` | Modifier son trajet | Auth requise |
| DELETE | `/rides/:id` | Annuler son trajet | Auth requise |
| GET | `/rides/price-estimate` | Fourchette de prix selon distance | Public |

**GET /rides/:id**
```json
// Response 200
{
  "id": "uuid",
  "event": { "id": "...", "name": "...", "venueName": "...", "startsAt": "..." },
  "driver": {
    "id": "uuid",
    "fullName": "Alice M.",
    "avatarUrl": "https://...",
    "age": 31,
    "bio": "J'adore les festivals !",
    "carModel": "Renault Clio",
    "ratingAsDriver": 4.8,
    "ridesAsDriverCount": 12,
    "memberSince": "2024-11",
    "preferences": ["NO_SMOKING", "NO_PETS"]
  },
  "direction": "OUTBOUND",
  "departureAddress": "Porte de Versailles, Paris",
  "departureLat": 48.832,
  "departureLng": 2.289,
  "departureTime": "2026-06-15T18:30:00Z",
  "estimatedArrival": "2026-06-15T19:45:00Z",
  "totalSeats": 3,
  "availableSeats": 2,
  "pricePerSeat": 8.50,
  "constraints": ["NO_SMOKING", "NO_PETS"],
  "notes": "Coffre un peu petit !",
  "status": "ACTIVE"
}
```

**GET /rides/price-estimate** — Query params : `departureLat`, `departureLng`, `eventId`
```json
// Response 200
{ "distanceKm": 23.4, "minPrice": 5.00, "maxPrice": 12.00, "currency": "EUR" }
```

**POST /rides**
```json
// Request
{
  "eventId": "tm_Z7r9jZ1A7vkVn",
  "direction": "OUTBOUND",
  "departureLat": 48.832,
  "departureLng": 2.289,
  "departureAddress": "Porte de Versailles, Paris",
  "departureTime": "2026-06-15T18:30:00Z",
  "totalSeats": 3,
  "pricePerSeat": 9.00,
  "constraints": ["NO_SMOKING"],
  "notes": "Coffre un peu petit !"
}
// Response 201 : { "id": "uuid", ... }
```

---

### 4.5 Réservations — `/bookings`

| Méthode | Route | Description | Accès |
|---------|-------|-------------|-------|
| POST | `/bookings` | Réserver un trajet | Auth requise |
| GET | `/bookings/:id` | Détail d'une réservation | Auth requise |
| POST | `/bookings/:id/cancel` | Annuler une réservation | Auth requise |
| GET | `/bookings/:id/invoice` | Récapitulatif de facturation | Auth requise |

**POST /bookings**
```json
// Request
{ "rideId": "uuid", "seatsBooked": 2 }

// Response 201
{
  "id": "uuid",
  "seatsBooked": 2,
  "totalPrice": 18.00,
  "commission": 1.80,
  "amountToDriver": 16.20,
  "status": "CONFIRMED",
  "paymentStatus": "UNPAID"
}
```

**GET /bookings/:id/invoice**
```json
// Response 200
{
  "bookingRef": "GC-2026-00123",
  "status": "CONFIRMED",
  "passenger": { "fullName": "...", "phone": "..." },
  "driver": {
    "fullName": "...",
    "avatarUrl": "...",
    "age": 31,
    "carModel": "Renault Clio",
    "ratingAsDriver": 4.8
  },
  "event": { "name": "...", "venueName": "...", "startsAt": "..." },
  "ride": {
    "direction": "OUTBOUND",
    "departureAddress": "...",
    "departureTime": "...",
    "estimatedArrival": "...",
    "constraints": [...]
  },
  "pricing": {
    "pricePerSeat": 9.00,
    "seatsBooked": 2,
    "subtotal": 18.00,
    "platformFee": 1.80,
    "total": 18.00,
    "currency": "EUR"
  },
  "payment": { "status": "UNPAID", "stub": true }
}
```

---

### 4.6 Alertes — `/alerts`

| Méthode | Route | Description | Accès |
|---------|-------|-------------|-------|
| POST | `/alerts` | Créer une alerte pour un événement | Auth requise |
| GET | `/alerts` | Mes alertes actives | Auth requise |
| DELETE | `/alerts/:id` | Supprimer une alerte | Auth requise |

**POST /alerts**
```json
// Request
{
  "eventId": "tm_Z7r9jZ1A7vkVn",
  "originLat": 48.856,
  "originLng": 2.352,
  "radiusKm": 10,
  "direction": "OUTBOUND"
}
// Response 201 : { "id": "uuid", "isActive": true, ... }
```

---

### 4.7 Avis — `/reviews`

| Méthode | Route | Description | Accès |
|---------|-------|-------------|-------|
| POST | `/reviews` | Laisser un avis post-trajet | Auth requise |
| GET | `/users/:id/reviews` | Avis reçus par un utilisateur | Public |

**POST /reviews**
```json
// Request
{
  "bookingId": "uuid",
  "role": "PASSENGER_REVIEWING_DRIVER",
  "rating": 5,
  "comment": "Très ponctuel, voiture propre !"
}
```

---

## 5. Logique métier clé

### 5.1 Calcul de prix (PricingService)

```typescript
const BASE_RATE_PER_KM = 0.08  // €/km
const MIN_PRICE = 2.00
const MAX_PRICE_CAP = 50.00

function estimatePrice(distanceKm: number): { min: number; max: number } {
  const base = distanceKm * BASE_RATE_PER_KM
  return {
    min: Math.max(MIN_PRICE, Math.round(base * 0.8 * 2) / 2),
    max: Math.min(MAX_PRICE_CAP, Math.round(base * 1.2 * 2) / 2)
  }
}
```

### 5.2 Commission GoConcert

Taux configurable via `COMMISSION_RATE` (ex: `0.10` = 10%).  
Calculée à la création de la réservation et stockée dans `Booking.commission`.

### 5.3 Système d'alertes (NotificationService)

À chaque création de trajet (`POST /rides`), le service effectue :
1. Requête PostGIS : trouver les alertes actives pour le même `eventId` et `direction`
2. Dont le point `(originLat, originLng)` est à moins de `radiusKm` du point de départ du trajet
3. Envoyer une notification push à chaque utilisateur concerné
4. Mettre à jour `Alert.triggeredAt`

```sql
SELECT a.* FROM alerts a
WHERE a.event_id = $1
  AND a.direction = $2
  AND a.is_active = true
  AND ST_DWithin(
    ST_SetSRID(ST_MakePoint(a.origin_lng, a.origin_lat), 4326)::geography,
    ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography,
    a.radius_km * 1000
  )
```

### 5.4 Notification d'annulation conducteur

Quand un conducteur annule son trajet (`DELETE /rides/:id`), le backend doit :
1. Passer le ride en `status: CANCELLED`
2. Récupérer tous les `Booking` confirmés sur ce ride
3. Passer chaque booking en `status: CANCELLED`
4. Envoyer une notification push à chaque passager :
   > *"Le conducteur a annulé le trajet pour [Nom du concert]. Ton billet de covoiturage a été annulé."*

### 5.5 Bounding Box carte

`GET /events/:id/rides` calcule une bounding box englobant la position du concert et tous les points de départ des rides actifs. Si aucun ride actif, bounding box par défaut de 50 km autour du concert.

### 5.6 Profil public conducteur — règles d'exposition

| Champ | Exposé ? | Remarque |
|-------|----------|----------|
| `fullName` | ✅ | |
| `avatarUrl` | ✅ | |
| `age` | ✅ | Calculé depuis `birthDate` — jamais `birthDate` brut |
| `bio` | ✅ | |
| `carModel` | ✅ | |
| `ratingAsDriver` | ✅ | |
| `ridesAsDriverCount` | ✅ | |
| `memberSince` | ✅ | Format `YYYY-MM` depuis `createdAt` |
| `preferences` | ✅ | Union des contraintes de ses rides actifs |
| `email` | ⛔ | |
| `phone` | ⛔ | |
| `pushToken` | ⛔ | |
| `birthDate` | ⛔ | Exposer uniquement `age` calculé |
| `providerId` | ⛔ | |

### 5.7 Ticketmaster

> 📄 Voir **`TICKETMASTER_MODULE.md`** pour le détail complet.

L'intégration utilise l'API interne de Ticketmaster (pas l'API officielle). Appels temps réel avec cache mémoire TTL 5 minutes. Le détail d'un événement requiert un cookie `tmpt` obtenu via Puppeteer/Browserless.

---

## 6. Migrations PostGIS

```sql
-- 001_enable_postgis.sql
CREATE EXTENSION IF NOT EXISTS postgis;

ALTER TABLE rides
  ADD COLUMN departure_location GEOGRAPHY(POINT, 4326);

CREATE INDEX rides_departure_location_idx
  ON rides USING GIST(departure_location);
```

---

## 7. Tests

- **Unit tests** : PricingService, NotificationService
- **Integration tests** : routes API avec base de données de test
- **Coverage cible : 80%** sur les services critiques

### Tests prioritaires
- Calcul de prix (cas limites)
- Matching des alertes PostGIS
- Réservation — race condition (2 users simultanés → transaction SQL)
- Annulation conducteur → notification passagers + cascade bookings
- Profil public conducteur → aucun champ privé exposé (test de sécurité)
- Routes publiques accessibles sans token
- Routes protégées → 401 sans token
- `silent_auth_middleware` → pas de 401 si token absent

---

## 8. Documentation Swagger

Générer avec `@adonisjs/swagger` ou `swagger-jsdoc`. Accessible sur `/docs` en développement.

Annoter chaque route avec : description, paramètres, body schema, niveau d'accès (Public / Auth optionnelle / Auth requise), codes de réponse (200, 201, 400, 401, 403, 404, 422, 500) et exemples de payload.

---

## 9. Variables d'environnement

```env
# Base
NODE_ENV=development
PORT=3333
APP_KEY=

# Base de données
DATABASE_URL=postgresql://user:pass@localhost:5432/goconcert

# Auth
JWT_SECRET=
JWT_EXPIRY=15m
JWT_REFRESH_EXPIRY=30d

# OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
APPLE_CLIENT_ID=
APPLE_TEAM_ID=
APPLE_KEY_ID=
APPLE_PRIVATE_KEY=

# SMS OTP
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# Ticketmaster (voir TICKETMASTER_MODULE.md)
BROWSERLESS_URL=
BROWSERLESS_TOKEN=
DISCORD_WEBHOOK_URL=

# Google Maps
GOOGLE_MAPS_API_KEY=

# Pricing
COMMISSION_RATE=0.10
MIN_PRICE_EUR=2.00
MAX_PRICE_EUR=50.00
BASE_RATE_PER_KM=0.08

# Notifications (Expo)
EXPO_ACCESS_TOKEN=

# Paiement (stub)
PAYMENT_STUB=true
STRIPE_SECRET_KEY=
```

---

## 10. Points d'attention ⚠️

### Race conditions sur les réservations
La décrémentation de `availableSeats` doit être faite dans une **transaction SQL avec verrou** (`SELECT FOR UPDATE`) pour éviter le surbooking.

### Exposition des données privées
Le profil public est accessible sans auth. Le serializer/DTO ne doit **jamais** exposer `email`, `phone`, `pushToken`, `birthDate` brut ou `providerId`. Écrire un test dédié qui vérifie l'absence de ces champs.

### `silent_auth_middleware`
Les routes "Auth optionnelle" ne doivent pas retourner 401 si le token est absent. Le middleware injecte `null` comme user et laisse passer la requête.

### Annulations et politique de remboursement
Non définie. Les statuts `CANCELLED` / `REFUNDED` sont prévus dans le schéma pour plus tard. Ne pas prendre de paiement réel tant que la politique n'est pas arrêtée.

### Double-sens des trajets
Un conducteur peut proposer un aller ET un retour pour le même événement — deux `Ride` distincts. Les alertes doivent distinguer les deux directions.

### Gestion des fuseaux horaires
Tous les `DateTime` stockés en UTC. L'API retourne de l'ISO 8601. Le frontend gère l'affichage local.

### Vérification conducteur
Pas de vérification de permis prévue. Si requis légalement, ajouter `driverLicenseVerified` sur `User`.

### Sécurité des prix
Toujours recalculer et valider `pricePerSeat` côté serveur dans la fourchette `[minPrice, maxPrice]`. Ne jamais faire confiance au client.

### Notifications push — Tokens périmés
Lors d'un échec d'envoi, désactiver le token en base (`pushToken = null`) pour éviter des appels inutiles futurs.

---

Regarde ce qui est déjà implémenté et pars de ça.