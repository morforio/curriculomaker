import { linesToRows, type RowLike } from '../../lib/rows.ts'
import type { SectionType } from '../../lib/schemas/resume.ts'

/**
 * Separa o texto de um currículo em blocos, SEM reescrever nada: o texto de cada bloco é copiado
 * exatamente como está no PDF (só junta linhas quebradas no meio de uma frase).
 * Só o que não for reconhecido fica de fora e é mostrado separado, para o usuário
 * adicionar à mão no editor.
 */

export type ImportedBlock = {
  /** Título exatamente como aparece no PDF. */
  title: string
  type: SectionType
  /** Linhas "tópico + texto" (tópico vazio = texto livre). */
  rows: RowLike[]
}

export type ParsedResume = {
  header: {
    fullName: string
    email: string
    phone: string
    location: string
    links: { label: string; url: string }[]
  }
  blocks: ImportedBlock[]
  /** Linhas do topo do documento que não foram reconhecidas como contato. */
  leftover: string[]
}

// Títulos reconhecidos (já normalizados: minúsculas, sem acento, sem pontuação).
const HEADINGS: Record<string, SectionType> = {
  // resumo
  resumo: 'summary',
  'resumo profissional': 'summary',
  perfil: 'summary',
  'perfil profissional': 'summary',
  objetivo: 'summary',
  'objetivo profissional': 'summary',
  'sobre mim': 'summary',
  introducao: 'summary',
  summary: 'summary',
  'professional summary': 'summary',
  profile: 'summary',
  'professional profile': 'summary',
  'about me': 'summary',
  objective: 'summary',
  // experiência
  experiencia: 'experience',
  'experiencia profissional': 'experience',
  'experiencia de trabalho': 'experience',
  'historico profissional': 'experience',
  experience: 'experience',
  'work experience': 'experience',
  'professional experience': 'experience',
  'employment history': 'experience',
  // formação
  formacao: 'education',
  'formacao academica': 'education',
  educacao: 'education',
  escolaridade: 'education',
  education: 'education',
  'academic background': 'education',
  // habilidades
  habilidades: 'skills',
  'habilidades tecnicas': 'skills',
  competencias: 'skills',
  'competencias tecnicas': 'skills',
  conhecimentos: 'skills',
  skills: 'skills',
  'technical skills': 'skills',
  // idiomas
  idiomas: 'languages',
  languages: 'languages',
  // outros (viram bloco livre)
  cursos: 'custom',
  certificacoes: 'custom',
  'cursos e certificacoes': 'custom',
  projetos: 'custom',
  voluntariado: 'custom',
  publicacoes: 'custom',
  'atividades complementares': 'custom',
  'informacoes adicionais': 'custom',
  courses: 'custom',
  certifications: 'custom',
  projects: 'custom',
  volunteering: 'custom',
  publications: 'custom',
  'additional information': 'custom',
}

function normalize(line: string): string {
  return line
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function headingType(line: string): SectionType | null {
  const raw = line.trim()
  if (!raw || raw.length > 45) return null
  return HEADINGS[normalize(raw)] ?? null
}

const BULLET = /^[•▪·●■◦▫‣\-–—]\s*/u

/**
 * Junta linhas quebradas no meio de uma frase. Uma linha é continuação da anterior quando:
 * - a anterior ocupa quase a largura toda (tamanho próximo ao das linhas mais longas do documento)
 *   e não termina em ponto final, ou
 * - a linha começa com minúscula e a anterior não termina em pontuação de fim de frase.
 * Linhas que começam com marcador nunca são continuação.
 */
function joinWrappedLines(lines: string[], fullWidth: number): string[] {
  const out: string[] = []
  for (const line of lines) {
    const prev = out[out.length - 1]
    if (prev !== undefined && !BULLET.test(line)) {
      const prevIsFull = fullWidth > 0 && prev.length >= fullWidth * 0.8 && !/[.!?]$/.test(prev)
      const startsLower = /^\p{Ll}/u.test(line) && !/[.!?:]$/.test(prev)
      if (prevIsFull || startsLower) {
        out[out.length - 1] = `${prev} ${line}`
        continue
      }
    }
    out.push(line)
  }
  return out
}

/** Comprimento (em caracteres) das linhas mais longas do documento: referência de "linha cheia". */
function fullLineWidth(lines: string[]): number {
  if (lines.length === 0) return 0
  const sorted = lines.map((l) => l.length).sort((a, b) => a - b)
  return sorted[Math.floor((sorted.length - 1) * 0.9)]
}

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/
const PHONE = /(?:\+\d{1,3}[\s-]?)?(?:\(\d{2}\)|\d{2})[\s-]?9?\s?\d{4}[\s-]?\d{4}/
const LINKEDIN = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w\-%.]+/i
const GITHUB = /(?:https?:\/\/)?(?:www\.)?github\.com\/[\w\-.]+/i
const LOCATION = /^(?:localiza[cç][aã]o|location|cidade|endere[cç]o)\s*:\s*(.+)$/i
const URL_FRAGMENT = /^[\w.-]+\.[a-z]{2,}(?:\/\S*)?$/i

function parseHeader(headerLines: string[]): ParsedResume['header'] & { leftover: string[] } {
  const lines = headerLines.map((l) => l.trim()).filter(Boolean)
  const header: ParsedResume['header'] = { fullName: '', email: '', phone: '', location: '', links: [] }

  const first = lines[0]
  let rest = lines
  if (first && !EMAIL.test(first) && !/\d/.test(first) && first.split(/\s+/).length <= 8) {
    header.fullName = first
    rest = lines.slice(1)
  }

  const all = rest.join(' ')
  header.email = all.match(EMAIL)?.[0] ?? ''
  header.phone = all.match(PHONE)?.[0] ?? ''
  const linkedin = all.match(LINKEDIN)?.[0]
  const github = all.match(GITHUB)?.[0]
  if (linkedin) header.links.push({ label: 'LinkedIn', url: linkedin })
  if (github) header.links.push({ label: 'GitHub', url: github })

  const leftover: string[] = []
  for (const line of rest) {
    const loc = line.match(LOCATION)
    if (loc) {
      header.location = loc[1].trim()
      continue
    }
    const consumed =
      EMAIL.test(line) || PHONE.test(line) || LINKEDIN.test(line) || GITHUB.test(line) || URL_FRAGMENT.test(line)
    if (!consumed) leftover.push(line)
  }
  return { ...header, leftover }
}

export function parseResumeText(rawLines: string[]): ParsedResume {
  const lines = rawLines.map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean)

  const firstHeading = lines.findIndex((l) => headingType(l) !== null)
  const headerLines = firstHeading === -1 ? lines : lines.slice(0, firstHeading)
  const { leftover, ...header } = parseHeader(headerLines)

  const fullWidth = fullLineWidth(lines)
  const blocks: ImportedBlock[] = []
  if (firstHeading !== -1) {
    let current: { title: string; type: SectionType; lines: string[] } | null = null
    for (const line of lines.slice(firstHeading)) {
      const type = headingType(line)
      if (type) {
        if (current) blocks.push(toBlock(current, fullWidth))
        current = { title: line.replace(/:\s*$/, ''), type, lines: [] }
      } else if (current) {
        current.lines.push(line)
      }
    }
    if (current) blocks.push(toBlock(current, fullWidth))
  }

  return { header, blocks: blocks.filter((b) => b.rows.length > 0), leftover: firstHeading === -1 ? lines : leftover }
}

function toBlock(c: { title: string; type: SectionType; lines: string[] }, fullWidth: number): ImportedBlock {
  const lines = joinWrappedLines(c.lines, fullWidth)
  // O resumo é um texto corrido: não separa em tópicos.
  const rows = c.type === 'summary' ? (lines.length ? [{ topic: '', text: lines.join('\n') }] : []) : linesToRows(lines)
  return { title: c.title, type: c.type, rows }
}
