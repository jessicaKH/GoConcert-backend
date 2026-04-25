import env from '#start/env'
import User from '#models/user'
import Alert from '#models/alert'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'

// Expo SDK is loaded lazily to avoid import issues in environments without it
let Expo: any = null

async function getExpo() {
  if (!Expo) {
    const mod = await import('expo-server-sdk')
    Expo = mod.default ?? mod.Expo
  }
  return Expo
}

export default class NotificationService {
  static async sendPush(
    pushToken: string,
    title: string,
    body: string,
    data?: Record<string, unknown>
  ): Promise<void> {
    const ExpoSdk = await getExpo()
    const expo = new ExpoSdk({ accessToken: env.get('EXPO_ACCESS_TOKEN') })

    if (!ExpoSdk.isExpoPushToken(pushToken)) {
      await this.invalidateToken(pushToken)
      return
    }

    const chunks = expo.chunkPushNotifications([{ to: pushToken, sound: 'default', title, body, data }])

    for (const chunk of chunks) {
      try {
        const tickets = await expo.sendPushNotificationsAsync(chunk)
        for (const ticket of tickets) {
          if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
            await this.invalidateToken(pushToken)
          }
        }
      } catch {
        // Silently fail — push is non-critical
      }
    }
  }

  private static async invalidateToken(pushToken: string): Promise<void> {
    await User.query().where('push_token', pushToken).update({ pushToken: null })
  }

  static async notifyRideAvailable(userId: string, eventName: string): Promise<void> {
    const user = await User.find(userId)
    if (!user?.pushToken) return
    await this.sendPush(
      user.pushToken,
      'Trajet disponible !',
      `Un conducteur propose un trajet pour ${eventName}. Réserve ta place !`,
      { type: 'RIDE_AVAILABLE' }
    )
  }

  static async notifyRideCancelled(userId: string, eventName: string): Promise<void> {
    const user = await User.find(userId)
    if (!user?.pushToken) return
    await this.sendPush(
      user.pushToken,
      'Trajet annulé',
      `Le conducteur a annulé le trajet pour ${eventName}. Ton billet de covoiturage a été annulé.`,
      { type: 'RIDE_CANCELLED' }
    )
  }

  static async matchAndNotifyAlerts(
    _rideId: string,
    eventId: string,
    direction: string,
    departureLat: number,
    departureLng: number,
    eventName: string
  ): Promise<void> {
    // PostGIS query — find active alerts within their radius of the ride departure point
    const matchedAlerts = await db.rawQuery<{ rows: any[] }>(
      `
      SELECT a.id, a.user_id, a.radius_km
      FROM alerts a
      WHERE a.event_id = ?
        AND a.direction = ?
        AND a.is_active = true
        AND ST_DWithin(
          ST_SetSRID(ST_MakePoint(a.origin_lng, a.origin_lat), 4326)::geography,
          ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography,
          a.radius_km * 1000
        )
      `,
      [eventId, direction, departureLng, departureLat]
    )

    const alerts = matchedAlerts.rows ?? []
    const now = DateTime.now()

    for (const alertRow of alerts) {
      await Promise.all([
        this.notifyRideAvailable(alertRow.user_id, eventName),
        Alert.query().where('id', alertRow.id).update({ triggeredAt: now.toSQL() }),
      ])
    }
  }
}
