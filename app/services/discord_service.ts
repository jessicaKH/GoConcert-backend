import env from '#start/env'

export default class DiscordService {
  private static get webhookUrl(): string | undefined {
    return env.get('DISCORD_WEBHOOK_URL')
  }

  static async notifyRotationSuccess(cookie: string): Promise<void> {
    await this.send({
      embeds: [
        {
          title: '✅ Rotation du cookie Ticketmaster réussie',
          color: 65280,
          fields: [{ name: 'Nouveau cookie', value: `tmpt=${cookie.slice(0, 50)}...` }],
        },
      ],
    })
  }

  static async notifyRotationFailure(error: string): Promise<void> {
    await this.send({
      embeds: [
        {
          title: '❌ Échec de la rotation du cookie Ticketmaster',
          color: 16711680,
          fields: [{ name: 'Erreur', value: error }],
        },
      ],
    })
  }

  static async notifyApiError(context: string, error: string): Promise<void> {
    await this.send({
      embeds: [
        {
          title: '🚨 Erreur Ticketmaster API',
          color: 16711680,
          fields: [
            { name: 'Contexte', value: context },
            { name: 'Erreur', value: error },
          ],
        },
      ],
    })
  }

  private static async send(payload: object): Promise<void> {
    if (!this.webhookUrl) return
    await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {})
  }
}
