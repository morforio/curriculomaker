import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const CAMINHOS = [
  process.env.NAVEGADOR_PDF,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
]

/** Gera o PDF a partir de um HTML usando o Edge ou o Chrome já instalados (sem dependência nova). Devolve false se não achar navegador. */
export function htmlParaPdf(htmlPath: string, pdfPath: string): boolean {
  const navegador = CAMINHOS.find((c) => c && existsSync(c))
  if (!navegador) return false
  // Perfil temporário: evita conflito com um Edge/Chrome que já esteja aberto.
  const perfil = mkdtempSync(join(tmpdir(), 'validacao-pdf-'))
  try {
    const r = spawnSync(navegador, ['--headless', '--disable-gpu', '--no-pdf-header-footer', `--user-data-dir=${perfil}`, `--print-to-pdf=${resolve(pdfPath)}`, pathToFileURL(resolve(htmlPath)).href], { stdio: 'ignore', timeout: 120_000 })
    // O navegador pode sair antes de terminar de gravar o arquivo: espera até 30 s ele aparecer.
    for (let i = 0; i < 60 && !existsSync(pdfPath); i++) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500)
    return r.status === 0 && existsSync(pdfPath)
  } finally {
    // O navegador ainda pode estar fechando e segurando a pasta: limpar é só higiene, então falhar aqui não importa.
    try {
      rmSync(perfil, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 })
    } catch {
      /* fica na pasta temporária do sistema */
    }
  }
}
