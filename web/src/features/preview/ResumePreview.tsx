import { Fragment, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { Resume, Row, Section } from '../../lib/schemas/resume'

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

export function ResumePreview({ resume }: { resume: Resume }) {
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
    <article className="cv-page">
      <div className="cv" style={{ fontSize: `${10 * resume.settings.fontScale}pt` }}>
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
    </article>
  )
}
