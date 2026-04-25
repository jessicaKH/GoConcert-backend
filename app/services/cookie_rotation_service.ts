import env from '#start/env'
import DiscordService from '#services/discord_service'
import TicketmasterService from '#services/ticketmaster_service'

export default class CookieRotationService {
  private static isRotating = false

  static async rotateCookie(): Promise<boolean> {
    if (this.isRotating) return false
    this.isRotating = true

    try {
      const browserlessUrl = env.get('BROWSERLESS_URL')
      const browserlessToken = env.get('BROWSERLESS_TOKEN')

      if (!browserlessUrl) {
        await DiscordService.notifyRotationFailure('BROWSERLESS_URL non configuré')
        return false
      }

      const wsEndpoint = browserlessToken
        ? `${browserlessUrl}?token=${browserlessToken}`
        : browserlessUrl

      // Lazy import to avoid loading puppeteer in environments that don't need it
      const puppeteerExtra = await import('puppeteer-extra')
      const StealthPlugin = await import('puppeteer-extra-plugin-stealth')

      const puppeteer: any = puppeteerExtra.default ?? puppeteerExtra
      const stealth: any = StealthPlugin.default ?? StealthPlugin
      puppeteer.use(stealth())

      const browser = await puppeteer.connect({ browserWSEndpoint: wsEndpoint } as any)
      const page = await browser.newPage()

      let tmptCookie = ''

      await page.setRequestInterception(true)

      page.on('request', (req: any) => {
        const cookieHeader = req.headers()['cookie'] || ''
        const match = cookieHeader.match(/tmpt=([^;]+)/)
        if (match) tmptCookie = match[1]
        req.continue()
      })

      page.on('response', (res: any) => {
        const setCookie = res.headers()['set-cookie'] || ''
        const match = setCookie.match(/tmpt=([^;]+)/)
        if (match) tmptCookie = match[1]
      })

      await page.goto('https://www.ticketmaster.fr', {
        waitUntil: 'networkidle2',
        timeout: 30000,
      })

      // TM sets the cookie via JS — wait required
      await new Promise((resolve) => setTimeout(resolve, 8000))

      page.removeAllListeners()

      if (!tmptCookie) {
        const cookies = await page.cookies()
        tmptCookie = cookies.find((c: any) => c.name === 'tmpt')?.value || ''
      }

      await browser.close()

      if (tmptCookie) {
        TicketmasterService.setTmptCookie(tmptCookie)
        await DiscordService.notifyRotationSuccess(tmptCookie)
        return true
      }

      await DiscordService.notifyRotationFailure('Cookie tmpt introuvable après navigation')
      return false
    } catch (error: any) {
      await DiscordService.notifyRotationFailure(error.message ?? 'Erreur inconnue')
      return false
    } finally {
      this.isRotating = false
    }
  }
}
