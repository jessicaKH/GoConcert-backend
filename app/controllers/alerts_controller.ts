import type { HttpContext } from '@adonisjs/core/http'
import { randomUUID } from 'node:crypto'
import Alert from '#models/alert'
import Event from '#models/event'
import { createAlertValidator } from '#validators/alert_validator'

export default class AlertsController {
  async store({ auth, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const data = await request.validateUsing(createAlertValidator)

    const event = await Event.find(data.eventId)
    if (!event) {
      return response.notFound({ message: 'Événement introuvable' })
    }

    const alert = await Alert.updateOrCreate(
      { userId: user.id, eventId: data.eventId, direction: data.direction },
      {
        id: randomUUID(),
        originLat: data.originLat,
        originLng: data.originLng,
        radiusKm: data.radiusKm,
        isActive: true,
        triggeredAt: null,
      }
    )

    return response.created(alert.serialize())
  }

  async index({ auth, response }: HttpContext) {
    const user = auth.getUserOrFail()

    const alerts = await Alert.query()
      .where('userId', user.id)
      .where('isActive', true)
      .preload('event')
      .orderBy('createdAt', 'desc')

    return response.ok(alerts.map((a) => a.serialize()))
  }

  async destroy({ auth, params, response }: HttpContext) {
    const user = auth.getUserOrFail()

    const alert = await Alert.query()
      .where('id', params.id)
      .where('userId', user.id)
      .firstOrFail()

    await alert.merge({ isActive: false }).save()

    return response.ok({ message: 'Alerte supprimée' })
  }
}
