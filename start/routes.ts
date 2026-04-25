import { middleware } from '#start/kernel'
import router from '@adonisjs/core/services/router'
import { controllers } from '#generated/controllers'

router.get('/', () => ({ status: 'ok', version: 'v1' }))

router
  .group(() => {
    // ─── Auth ─────────────────────────────────────────────────────────────────
    router
      .group(() => {
        router.post('google', [controllers.Auth, 'googleLogin'])
        router.post('apple', [controllers.Auth, 'appleLogin'])
        router.post('otp/send', [controllers.Auth, 'sendOtp'])
        router.post('otp/verify', [controllers.Auth, 'verifyOtp'])
        router.post('refresh', [controllers.Auth, 'refresh'])
        router.post('logout', [controllers.Auth, 'logout']).use(middleware.auth())
      })
      .prefix('auth')

    // ─── Utilisateurs ─────────────────────────────────────────────────────────
    router
      .group(() => {
        router.get('me', [controllers.Users, 'me'])
        router.put('me', [controllers.Users, 'updateMe'])
        router.put('me/push-token', [controllers.Users, 'updatePushToken'])
        router.get('me/bookings', [controllers.Users, 'myBookings'])
        router.get('me/rides', [controllers.Users, 'myRides'])
      })
      .prefix('users')
      .use(middleware.auth())

    router.get('users/:id/profile', [controllers.Users, 'publicProfile'])
    router.get('users/:id/reviews', [controllers.Users, 'userReviews'])

    // ─── Événements ───────────────────────────────────────────────────────────
    router
      .group(() => {
        router.get('/', [controllers.Events, 'index'])
        router.get('/:id', [controllers.Events, 'show'])
        router.get('/:id/rides', [controllers.Events, 'rides'])
      })
      .prefix('events')

    // ─── Trajets ──────────────────────────────────────────────────────────────
    router.get('rides/price-estimate', [controllers.Rides, 'priceEstimate'])
    router
      .group(() => {
        router.post('/', [controllers.Rides, 'store']).use(middleware.auth())
        router.get('/:id', [controllers.Rides, 'show'])
        router.put('/:id', [controllers.Rides, 'update']).use(middleware.auth())
        router.delete('/:id', [controllers.Rides, 'destroy']).use(middleware.auth())
      })
      .prefix('rides')

    // ─── Réservations ─────────────────────────────────────────────────────────
    router
      .group(() => {
        router.post('/', [controllers.Bookings, 'store'])
        router.get('/:id', [controllers.Bookings, 'show'])
        router.post('/:id/cancel', [controllers.Bookings, 'cancel'])
        router.get('/:id/invoice', [controllers.Bookings, 'invoice'])
      })
      .prefix('bookings')
      .use(middleware.auth())

    // ─── Alertes ──────────────────────────────────────────────────────────────
    router
      .group(() => {
        router.post('/', [controllers.Alerts, 'store'])
        router.get('/', [controllers.Alerts, 'index'])
        router.delete('/:id', [controllers.Alerts, 'destroy'])
      })
      .prefix('alerts')
      .use(middleware.auth())

    // ─── Avis ─────────────────────────────────────────────────────────────────
    router.post('reviews', [controllers.Reviews, 'store']).use(middleware.auth())

    // ─── Admin Ticketmaster ───────────────────────────────────────────────────
    router
      .group(() => {
        router.post('ticketmaster/cookie', [controllers.TicketmasterAdmin, 'setCookie'])
        router.get('ticketmaster/cookie', [controllers.TicketmasterAdmin, 'getCookie'])
      })
      .prefix('admin')
      .use(middleware.auth())
  })
  .prefix('/api/v1')
