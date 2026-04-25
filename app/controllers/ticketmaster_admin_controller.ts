import type { HttpContext } from '@adonisjs/core/http'
import TicketmasterService from '#services/ticketmaster_service'
import vine from '@vinejs/vine'

const setCookieValidator = vine.compile(
  vine.object({
    cookie: vine.string().minLength(10),
  })
)

export default class TicketmasterAdminController {
  async setCookie({ request, response }: HttpContext) {
    const { cookie } = await request.validateUsing(setCookieValidator)
    TicketmasterService.setTmptCookie(cookie)
    return response.ok({
      message: 'Cookie mis à jour',
      preview: `${cookie.slice(0, 30)}...`,
    })
  }

  async getCookie({ response }: HttpContext) {
    const cookie = TicketmasterService.getTmptCookie()
    if (!cookie) {
      return response.ok({ cookie: null, message: 'Aucun cookie configuré' })
    }
    return response.ok({ preview: `${cookie.slice(0, 30)}...` })
  }
}
