import env from '#start/env'
import DiscordService from '#services/discord_service'
import TicketmasterService from '#services/ticketmaster_service'

export default class CookieRotationService {
  private static isRotating = false

  static async rotateCookie(): Promise<boolean> {
    if (this.isRotating) return false
    this.isRotating = true
    let browser = null

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

      const puppeteerExtra = await import('puppeteer-extra')
      const StealthPlugin = await import('puppeteer-extra-plugin-stealth')

      const puppeteer: any = puppeteerExtra.default ?? puppeteerExtra
      const stealth: any = StealthPlugin.default ?? StealthPlugin
      puppeteer.use(stealth())

      browser = await puppeteer.connect({ browserWSEndpoint: wsEndpoint } as any)
      const page = await browser.newPage()
      await page.setRequestInterception(true)

      let tmptCookie = ''
      let cookieFound = false

      const requestHandler = (req: any) => {
        const cookieHeader = req.headers()['cookie'] ?? ''
        if (cookieHeader.includes('tmpt=') && !cookieFound) {
          const match = cookieHeader.match(/tmpt=([^;]+)/)
          if (match) {
            tmptCookie = match[1]
            cookieFound = true
          }
        }
        req.continue()
      }

      const responseHandler = (res: any) => {
        const setCookie = res.headers()['set-cookie'] ?? ''
        if (setCookie.includes('tmpt=') && !cookieFound) {
          const match = setCookie.match(/tmpt=([^;]+)/)
          if (match) {
            tmptCookie = match[1]
            cookieFound = true
          }
        }
      }

      const cookieFoundPromise = new Promise<void>((resolve) => {
        const check = () => {
          if (cookieFound) resolve()
          else setTimeout(check, 100)
        }
        check()
      })

      page.on('request', requestHandler)
      page.on('response', responseHandler)

      page.goto('https://www.ticketmaster.fr', { timeout: 30000 }).catch(() => {})

      await Promise.race([cookieFoundPromise, new Promise((resolve) => setTimeout(resolve, 8000))])

      page.off('request', requestHandler)
      page.off('response', responseHandler)

      await browser.close()
      browser = null

      if (tmptCookie) {
        TicketmasterService.setTmptCookie(tmptCookie)
        await DiscordService.notifyRotationSuccess(tmptCookie)
        return true
      }

      await DiscordService.notifyRotationFailure('Cookie tmpt introuvable après navigation')
      return false
    } catch (error: any) {
      if (browser) await browser.close()
      await DiscordService.notifyRotationFailure(error.message ?? 'Erreur inconnue')
      return false
    } finally {
      this.isRotating = false
    }
  }
}
