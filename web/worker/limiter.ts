import { DurableObject } from 'cloudflare:workers'

/**
 * Contadores de uso da análise de vaga (um único objeto global, com armazenamento SQLite).
 * - por IP (já com hash): até `perIpHour` análises por hora;
 * - total: até `dailyCap` análises por dia (UTC).
 * Um objeto só atende um pedido por vez, então a contagem é atômica.
 */
export class Limiter extends DurableObject {
  async check(ipKey: string, perIpHour: number, dailyCap: number): Promise<'ok' | 'ip' | 'daily'> {
    const iso = new Date().toISOString()
    const hour = iso.slice(0, 13)
    const day = iso.slice(0, 10)
    const storage = this.ctx.storage

    // Ao virar a hora, apaga contadores antigos para o armazenamento não crescer.
    if ((await storage.get<string>('lastHour')) !== hour) {
      const old = await storage.list({ prefix: 'ip:' })
      const stale = [...old.keys()].filter((k) => !k.startsWith(`ip:${hour}:`))
      if (stale.length > 0) await storage.delete(stale)
      const oldDays = await storage.list({ prefix: 'day:' })
      const staleDays = [...oldDays.keys()].filter((k) => k !== `day:${day}`)
      if (staleDays.length > 0) await storage.delete(staleDays)
      await storage.put('lastHour', hour)
    }

    const ipKeyName = `ip:${hour}:${ipKey}`
    const dayKeyName = `day:${day}`
    const ipCount = (await storage.get<number>(ipKeyName)) ?? 0
    const dayCount = (await storage.get<number>(dayKeyName)) ?? 0

    if (dayCount >= dailyCap) return 'daily'
    if (ipCount >= perIpHour) return 'ip'

    await storage.put({ [ipKeyName]: ipCount + 1, [dayKeyName]: dayCount + 1 })
    return 'ok'
  }
}
