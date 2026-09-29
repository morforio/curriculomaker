import { Fragment, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { Resume, Section } from '../../lib/schemas/resume'

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

function Lines({ text }: { text: string }) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return null
  return (
    <ul>
      {lines.map((l, i) => (
        <li key={i}>
          <Inline text={l} />
        </li>
      ))}
    </ul>
  )
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
      return (
        <p className="cv-text-block">
          <Inline text={section.data.text} />
        </p>
      )
    case 'custom':
      return (
        <p className="cv-text-block">
          <Inline text={section.data.markdown} />
        </p>
      )
    case 'experience':
      return (
        <>
          {section.data.items.map((item, i) => (
            <div key={i} className="cv-entry">
              <Title main={joinParts([item.role, item.company], ', ')} period={item.period} />
              {item.location.trim() && <p className="cv-meta">{item.location}</p>}
              <Lines text={item.description} />
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
              <Lines text={item.description} />
            </div>
          ))}
        </>
      )
    case 'skills':
      return (
        <ul>
          {section.data.groups
            .filter((g) => g.items.length > 0)
            .map((g, i) => (
              <li key={i}>
                {g.label.trim() && <strong>{g.label.trim()}: </strong>}
                {g.items.join(', ')}
              </li>
            ))}
        </ul>
      )
    case 'languages':
      return (
        <p>
          {section.data.items
            .filter((l) => l.name.trim())
            .map((l) => joinParts([l.name, l.level], ' - '))
            .join('; ')}
        </p>
      )
  }
}

function isEmpty(section: Section): boolean {
  switch (section.type) {
    case 'summary':
      return !section.data.text.trim()
    case 'custom':
      return !section.data.markdown.trim()
    case 'experience':
      return section.data.items.every((i) => !joinParts([i.role, i.company, i.period, i.description]))
    case 'education':
      return section.data.items.every((i) => !joinParts([i.degree, i.institution, i.period, i.description]))
    case 'skills':
      return section.data.groups.every((g) => g.items.length === 0)
    case 'languages':
      return section.data.items.every((l) => !l.name.trim())
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
