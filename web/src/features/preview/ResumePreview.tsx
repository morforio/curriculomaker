import { Fragment, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { FONT_SIZES, type Resume, type Row, type Section } from '../../lib/schemas/resume'
import { useResumeStore } from '../../store/resumeStore'

/**
 * Template ATS-friendly: uma coluna, HTML semântico, texto real, sem tabelas, ícones nem
 * elementos com posição fixa. O visual (cores, filetes, caixa de contato) é só estilo CSS.
 * Estilos em src/index.css (classes .cv-*).
 */

/** Texto com **negrito** simples. */
function Inline({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g)
  return (
    <>
      {parts.map((p, i) => (i % 2 ? <strong key={i}>{p}</strong> : <Fragment key={i}>{p}</Fragment>))}
    </>
  )
}

const BULLET_RE = /^\s*(?:[•▪·●■◦▫‣]\s*|[-–—]\s+)/u

/** Texto livre: linhas com marcador (•, -, –) viram lista; as demais viram parágrafos. */
function RichText({ text }: { text: string }) {
  const out: ReactNode[] = []
  let bullets: string[] = []
  const flush = () => {
    if (bullets.length === 0) return
    const items = bullets
    out.push(
      <ul key={`u${out.length}`}>
        {items.map((b, i) => (
          <li key={i}>
            <Inline text={b} />
          </li>
        ))}
      </ul>,
    )
    bullets = []
  }
  for (const line of text.split('\n')) {
    const m = line.match(BULLET_RE)
    if (m) {
      bullets.push(line.slice(m[0].length))
    } else {
      flush()
      if (line.trim()) {
        out.push(
          <p key={`p${out.length}`}>
            <Inline text={line} />
          </p>,
        )
      }
    }
  }
  flush()
  return <>{out}</>
}

/**
 * Linhas "tópico + texto": com tópico viram marcador com o tópico em negrito;
 * sem tópico viram texto livre (parágrafos e, se começarem com - ou •, marcadores).
 */
function RowsView({ rows }: { rows: Row[] }) {
  const out: ReactNode[] = []
  let topicRows: Row[] = []
  const flush = () => {
    if (topicRows.length === 0) return
    const items = topicRows
    out.push(
      <ul key={`t${out.length}`}>
        {items.map((r, i) => {
          const topic = r.topic.trim().replace(/:\s*$/, '')
          return (
            <li key={i}>
              <strong>{topic}</strong>
              {r.text.trim() ? ': ' : ''}
              <Inline text={r.text.trim()} />
            </li>
          )
        })}
      </ul>,
    )
    topicRows = []
  }
  for (const row of rows) {
    if (row.topic.trim()) {
      topicRows.push(row)
    } else if (row.text.trim()) {
      flush()
      out.push(<RichText key={`r${out.length}`} text={row.text} />)
    }
  }
  flush()
  return <>{out}</>
}

function rowsEmpty(rows: Row[]): boolean {
  return rows.every((r) => !r.topic.trim() && !r.text.trim())
}

function joinParts(parts: string[], sep = ' | ') {
  return parts.map((p) => p.trim()).filter(Boolean).join(sep)
}

function hrefOf(url: string) {
  const u = url.trim()
  if (/^(https?:|mailto:|tel:)/i.test(u)) return u
  return `https://${u}`
}

function Title({ main, period }: { main: string; period?: string }) {
  if (!main.trim() && !period?.trim()) return null
  return (
    <p className="cv-title">
      {main.trim()}
      {period?.trim() && (
        <>
          {main.trim() ? ' ' : ''}
          <em>| {period.trim()}</em>
        </>
      )}
    </p>
  )
}

function SectionBody({ section }: { section: Section }) {
  switch (section.type) {
    case 'summary':
    case 'skills':
    case 'languages':
    case 'custom':
      return <RowsView rows={section.data.rows} />
    case 'experience':
      return (
        <>
          {section.data.items.map((item, i) => (
            <div key={i} className="cv-entry">
              <Title main={joinParts([item.role, item.company], ', ')} period={item.period} />
              {item.location.trim() && <p className="cv-meta">{item.location}</p>}
              <RowsView rows={item.rows} />
            </div>
          ))}
        </>
      )
    case 'education':
      return (
        <>
          {section.data.items.map((item, i) => (
            <div key={i} className="cv-entry">
              <Title main={joinParts([item.degree, item.institution], ', ')} period={item.period} />
              <RowsView rows={item.rows} />
            </div>
          ))}
        </>
      )
  }
}

function isEmpty(section: Section): boolean {
  switch (section.type) {
    case 'summary':
    case 'skills':
    case 'languages':
    case 'custom':
      return rowsEmpty(section.data.rows)
    case 'experience':
      return section.data.items.every((i) => !joinParts([i.role, i.company, i.period]) && rowsEmpty(i.rows))
    case 'education':
      return section.data.items.every((i) => !joinParts([i.degree, i.institution, i.period]) && rowsEmpty(i.rows))
  }
}

function Separated({ items }: { items: ReactNode[] }) {
  return (
    <>
      {items.map((node, i) => (
        <Fragment key={i}>
          {i > 0 && '  |  '}
          {node}
        </Fragment>
      ))}
    </>
  )
}

/** O currículo em si (sem a folha): o mesmo conteúdo vai para a tela, para a medição de páginas e para a impressão. */
function ResumeContent({ resume }: { resume: Resume }) {
  const { t } = useTranslation()
  const { header } = resume

  const line1: ReactNode[] = []
  if (header.email.trim()) line1.push(<><strong>{t('contact.email')}:</strong> {header.email.trim()}</>)
  if (header.phone.trim()) line1.push(<><strong>{t('contact.phone')}:</strong> {header.phone.trim()}</>)
  header.links
    .filter((l) => l.url.trim())
    .forEach((l) =>
      line1.push(
        <>
          {l.label.trim() && <strong>{l.label.trim()}: </strong>}
          <a href={hrefOf(l.url)}>{l.url.trim()}</a>
        </>,
      ),
    )

  return (
    <div className="cv" style={{ fontSize: `${resume.settings.fontSize}pt` }}>
        <header>
          <h1 className="cv-name">{header.fullName.trim() || t('preview.placeholderName')}</h1>
          {header.headline.trim() && <p className="cv-headline">{header.headline}</p>}
          {(line1.length > 0 || header.location.trim()) && (
            <div className="cv-contact">
              {line1.length > 0 && (
                <p>
                  <Separated items={line1} />
                </p>
              )}
              {header.location.trim() && (
                <p>
                  <strong>{t('contact.location')}:</strong> {header.location.trim()}
                </p>
              )}
            </div>
          )}
        </header>
        {resume.sections
          .filter((s) => !isEmpty(s))
          .map((section) => (
            <section key={section.id}>
              <h2 className="cv-h2">{section.title}</h2>
              <SectionBody section={section} />
            </section>
          ))}
    </div>
  )
}

// A4 com as margens do @page (index.css): 15 mm em cima e embaixo, 18 mm nas laterais.
// Unidades CSS absolutas: 1 mm = 96 / 25,4 px, independente da tela.
const MM = 96 / 25.4
const SHEET_W = 210 * MM
const SHEET_H = 297 * MM
const CONTENT_H = 267 * MM

// Blocos que o navegador não parte ao imprimir (parágrafos, itens de lista, cabeçalho) e os que ficam com o seguinte.
const BLOCKS = 'header > *, section h2, section p, section li'
const KEEP_WITH_NEXT = '.cv-h2, .cv-title, .cv-meta'

/**
 * Onde cada página começa (em px, a partir do topo do conteúdo), imitando a quebra da impressão:
 * a página fecha antes do primeiro bloco que não cabe, e título de bloco/cargo não fica sozinho no fim da página.
 */
function pageStarts(root: HTMLElement): number[] {
  const base = root.getBoundingClientRect().top
  const blocks = [...root.querySelectorAll<HTMLElement>(BLOCKS)].map((el) => {
    const r = el.getBoundingClientRect()
    return { top: r.top - base, bottom: r.bottom - base, keep: el.matches(KEEP_WITH_NEXT) }
  })
  const starts = [0]
  let start = 0
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].bottom - start <= CONTENT_H + 0.5) continue
    let j = i
    while (j > 0 && blocks[j - 1].keep && blocks[j - 1].top > start + 0.5) j--
    // Bloco maior que a página (ou já no topo): corta onde a página acaba.
    start = blocks[j].top > start + 0.5 ? blocks[j].top : start + CONTENT_H
    starts.push(start)
    i = j - 1
  }
  return starts
}

function sameStarts(a: number[], b: number[]) {
  return a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 0.5)
}

export function ResumePreview({ resume }: { resume: Resume }) {
  const { t, i18n } = useTranslation()
  const setFontSize = useResumeStore((s) => s.setFontSize)
  const measureRef = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const [starts, setStarts] = useState<number[]>([0])
  const [scale, setScale] = useState(1)

  // Mede o currículo fora da tela, com a largura real do A4, e calcula onde cada página começa.
  useLayoutEffect(() => {
    const measure = () => {
      const root = measureRef.current?.firstElementChild as HTMLElement | null
      if (!root) return
      const next = pageStarts(root)
      setStarts((prev) => (sameStarts(prev, next) ? prev : next))
    }
    measure()
    void document.fonts?.ready.then(measure)
  }, [resume, i18n.language])

  // A folha tem tamanho fixo; em colunas mais estreitas, a prévia é reduzida para caber.
  useLayoutEffect(() => {
    const box = boxRef.current
    if (!box) return
    // Largura 0 = coluna ainda sem layout (ou oculta): mantém a escala anterior.
    const update = () => box.clientWidth > 0 && setScale(Math.min(1, box.clientWidth / SHEET_W))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(box)
    return () => ro.disconnect()
  }, [])

  const pages = starts.length

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <h2 className="text-sm font-semibold text-gray-900">
          {t('preview.title')} <span className="font-normal text-gray-500">· {t('preview.pages', { count: pages })}</span>
        </h2>
        <label className="flex items-center gap-1.5 text-sm text-gray-600">
          {t('preview.fontSize')}
          <select
            className="rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900"
            value={resume.settings.fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
          >
            {FONT_SIZES.map((size) => (
              <option key={size} value={size}>
                {size} pt
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Medição (fora da tela, sem afetar o layout). */}
      <div aria-hidden="true" style={{ position: 'absolute', left: -99999, top: 0, width: '174mm', visibility: 'hidden' }} ref={measureRef}>
        <ResumeContent resume={resume} />
      </div>

      {/* Prévia na tela: uma folha A4 por página, mostrando só a parte do currículo que cai nela. */}
      <div ref={boxRef} className="space-y-4 print:hidden">
        {starts.map((start, i) => (
          <div key={i}>
            <div style={{ width: SHEET_W * scale, height: SHEET_H * scale, margin: '0 auto' }}>
              <div
                aria-hidden={i > 0 ? 'true' : undefined}
                className="cv-sheet"
                style={{ width: SHEET_W, height: SHEET_H, transform: `scale(${scale})`, transformOrigin: '0 0' }}
              >
                {/* A janela termina onde a próxima página começa: assim o pedaço do bloco que vai para a próxima não aparece aqui. */}
                <div style={{ height: i < pages - 1 ? Math.min(CONTENT_H, starts[i + 1] - start) : CONTENT_H, overflow: 'hidden' }}>
                  <div style={{ transform: `translateY(${-start}px)` }}>
                    <ResumeContent resume={resume} />
                  </div>
                </div>
              </div>
            </div>
            <p className="mt-1 text-center text-xs text-gray-500">{t('preview.pageOf', { current: i + 1, total: pages })}</p>
          </div>
        ))}
      </div>

      {/* Impressão: o documento corrido; o navegador faz a paginação real do PDF. */}
      <article className="cv-page hidden print:block">
        <ResumeContent resume={resume} />
      </article>
    </div>
  )
}
