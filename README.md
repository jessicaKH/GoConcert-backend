# GoConcert — Backend

Plateforme de covoiturage spécialisée pour les événements musicaux (concerts, festivals). Met en relation des conducteurs ayant des places disponibles avec des passagers se rendant au même événement.

## Stack

- **Runtime** — Node.js 24
- **Framework** — AdonisJS 6 (TypeScript, ESM)
- **Base de données** — PostgreSQL 16 + PostGIS (géospatial)
- **ORM** — Lucid (AdonisJS natif)
- **Auth** — Opaque access tokens (`DbAccessTokensProvider`) + refresh tokens 30j
- **Tests** — Japa (unit + functional)
- **CI** — GitHub Actions

## Prérequis

- Node.js 24 (`nvm use`)
- Docker (pour PostgreSQL local)

## Démarrage rapide

```bash
# 1. Dépendances
npm install

# 2. Base de données
docker compose up -d

# 3. Variables d'environnement
cp .env.example .env
# Remplir APP_KEY :
node ace generate:key
# Coller la valeur dans .env → APP_KEY=...

# 4. Migrations
node ace migration:run

# 5. Données de dev (optionnel)
node ace db:seed

# 6. Serveur
node ace serve --hmr
```

API disponible sur `http://localhost:3333`.

## Variables d'environnement

| Variable | Obligatoire | Description |
|---|---|---|
| `APP_KEY` | Oui | Clé de chiffrement (`node ace generate:key`) |
| `DATABASE_URL` | Oui | URL PostgreSQL |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Auth Google | OAuth2 |
| `APPLE_CLIENT_ID` / `APPLE_TEAM_ID` / `APPLE_KEY_ID` / `APPLE_PRIVATE_KEY` | Auth Apple | Sign in with Apple |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_PHONE_NUMBER` | OTP SMS | Envoi des codes OTP |
| `BROWSERLESS_URL` / `BROWSERLESS_TOKEN` | Cookie TM | Rotation du cookie Ticketmaster |
| `DISCORD_WEBHOOK_URL` | Non | Alertes d'erreur internes |
| `GOOGLE_MAPS_API_KEY` | Non | Géocodage |
| `EXPO_ACCESS_TOKEN` | Non | Push notifications |
| `STRIPE_SECRET_KEY` | Non | Paiement (stub actif par défaut) |

Voir `.env.example` pour toutes les valeurs.

## Routes API

Toutes les routes sont préfixées `/api/v1`. La consultation est publique — l'auth n'est requise qu'à l'action.

```
POST   /auth/google            — Login Google (idToken)
POST   /auth/apple             — Login Apple (idToken)
POST   /auth/otp/send          — Envoi code OTP SMS
POST   /auth/otp/verify        — Vérification code OTP → tokens
POST   /auth/refresh           — Renouvellement access token
POST   /auth/logout            — Révocation (auth)

GET    /users/me               — Profil complet (auth)
PUT    /users/me               — Mise à jour profil (auth)
PUT    /users/me/push-token    — Enregistrement push token (auth)
GET    /users/me/bookings      — Mes réservations (auth)
GET    /users/me/rides         — Mes trajets (auth)
GET    /users/:id/profile      — Profil public conducteur
GET    /users/:id/reviews      — Avis reçus

GET    /events                 — Liste / recherche événements (Ticketmaster)
GET    /events/:id             — Détail événement
GET    /events/:id/rides       — Trajets disponibles pour un événement

GET    /rides/price-estimate   — Estimation tarifaire (lat/lng + eventId)
POST   /rides                  — Créer un trajet (auth)
GET    /rides/:id              — Détail trajet + profil conducteur
PUT    /rides/:id              — Modifier trajet (auth, driver only)
DELETE /rides/:id              — Annuler trajet (auth, driver only)

POST   /bookings               — Réserver (auth)
GET    /bookings/:id           — Détail réservation (auth)
POST   /bookings/:id/cancel    — Annuler réservation (auth)
GET    /bookings/:id/invoice   — Reçu (auth)

POST   /alerts                 — Créer alerte disponibilité (auth)
GET    /alerts                 — Mes alertes (auth)
DELETE /alerts/:id             — Supprimer alerte (auth)

POST   /reviews                — Laisser un avis (auth)

POST   /admin/ticketmaster/cookie  — Définir cookie tmpt (auth)
GET    /admin/ticketmaster/cookie  — Lire cookie tmpt actif (auth)
```

## Architecture

```
app/
├── controllers/     — Logique HTTP (validation → service → réponse)
├── models/          — Modèles Lucid (User, Ride, Booking, Event, Alert, Review…)
├── services/        — Logique métier (PricingService, TicketmasterService, NotificationService…)
├── validators/      — Schémas VineJS
├── middleware/      — auth, silent_auth, force_json
├── dtos/            — Types Ticketmaster API
└── utils/
    └── tm_utils.ts  — Mapping villes françaises ↔ IDs Ticketmaster internes

database/
├── migrations/      — 10 migrations (users → postgis)
└── seeders/         — Données de dev (8 users, 5 events, 10 rides, 8 bookings…)
```

## Fonctionnement clé

**Prix** — Calculé via Haversine (distance départ → venue). Fourchette min/max arrondie au 0,50€. Commission 10% prélevée à la réservation.

**Réservation** — `SELECT FOR UPDATE` en transaction pour éviter le surbooking concurrent. Le ride passe en `FULL` quand `availableSeats = 0`.

**Ticketmaster** — Pas de clé API officielle. Requêtes sur `ticketmaster.fr` avec `idTiers=78768`. Le cookie `tmpt` est requis pour les détails d'événement et est renouvelé via Puppeteer/Browserless (stealth).

**Alertes** — Matchées via PostGIS `ST_DWithin` dès qu'un trajet est créé. Notifications push envoyées via Expo SDK.

**Auth** — Access token 15 min + refresh token 30 jours en base. Trois providers : Google OAuth2, Apple Sign-In (JWKS), OTP SMS (Twilio).

## Tests

```bash
# Créer la base de test (une seule fois)
docker exec goconcert_db psql -U goconcert -c "CREATE DATABASE goconcert_test;"

# Tous les tests
npm test

# Unit seulement (sans DB)
node ace test --suites=unit

# Functional seulement (nécessite PostgreSQL)
node ace test --suites=functional
```

## CI

GitHub Actions sur push/PR vers `main` et `dev`. Lance typecheck + migrations + tests complets contre une instance PostGIS éphémère.

Seul secret requis : `APP_KEY` (Settings → Secrets and variables → Actions).
