/**
 * Validação da IA do CurriMaker: roda 15 pares currículo + vaga (fictícios) pelo mesmo caminho do site e gera 2 PDFs.
 *
 *   npm run validar                      todos os casos, com as chaves do web/.env (LLM_API_KEY e, se houver, TYPESAFE_API_KEY)
 *   npm run validar -- --so=c01,c05      só alguns casos
 *   npm run validar -- --simulado        sem chaves: respostas de mentira, só para ver o relatório funcionando
 *   npm run validar -- --sem-pdf         só os .html e o .json
 *
 * Saída em web/validacao/saida/<data-hora>/ (ignorada pelo Git): 01-resumo.pdf, 02-casos.pdf, os .html e resultados.json.
 * Gasta chamadas reais ao LLM e ao Jev (uma rodada completa são cerca de 15 a 45 chamadas ao LLM e 30 a 60 ao Jev).
 */
import { join } from 'node:path'
import { executar } from './executar.ts'

try {
  process.loadEnvFile('.env')
} catch {
  /* sem .env: vale o que já estiver no ambiente */
}

const arg = (nome: string) => process.argv.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3)
const simulado = process.argv.includes('--simulado')
const e = process.env

if (!simulado && !e.LLM_API_KEY) {
  console.error('Falta a LLM_API_KEY no web/.env (ou no ambiente). Para só ver o relatório funcionando, use: npm run validar -- --simulado')
  process.exit(1)
}

// Nome da pasta no horário de Brasília (GMT-3)
const br = new Date(Date.now() - 3 * 3600_000)
const pad = (n: number) => String(n).padStart(2, '0')
const carimbo = `${br.getUTCFullYear()}-${pad(br.getUTCMonth() + 1)}-${pad(br.getUTCDate())}_${pad(br.getUTCHours())}h${pad(br.getUTCMinutes())}${simulado ? '_simulado' : ''}`

const r = await executar({
  env: {
    LLM_API_KEY: e.LLM_API_KEY,
    LLM_BASE_URL: e.LLM_BASE_URL,
    LLM_MODEL: e.LLM_MODEL,
    LLM_FALLBACK_MODEL: e.LLM_FALLBACK_MODEL,
    LLM_REASONING_EFFORT: e.LLM_REASONING_EFFORT,
    TYPESAFE_API_KEY: e.TYPESAFE_API_KEY,
    TYPESAFE_BASE_URL: e.TYPESAFE_BASE_URL,
    TYPESAFE_MODEL: e.TYPESAFE_MODEL,
  },
  simulado,
  saida: arg('saida') ?? join('validacao', 'saida', carimbo),
  so: arg('so')?.split(',').filter(Boolean),
  pausaMs: simulado ? 0 : Number(arg('pausa') ?? 1500),
  pdf: !process.argv.includes('--sem-pdf'),
  log: (l) => console.log(l),
})

const cont = (v: string) => r.resultados.filter((x) => x.veredito === v).length
console.log(`\n${r.resultados.length} casos: ${cont('ok')} OK, ${cont('alerta')} com atenção, ${cont('falha')} com falha.${r.jevAtivo ? '' : ' (Jev desligado: sem notas de fidelidade)'}`)
console.log('Arquivos gerados:\n' + r.arquivos.map((a) => '  ' + a).join('\n'))
