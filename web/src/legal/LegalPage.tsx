import { useEffect } from 'react'
import { buildPrivacy, buildTerms, PRIVACY_TITLE, TERMS_TITLE, type Block, type LegalDoc } from './content.ts'
import { useSeller } from './useSeller.ts'

/**
 * Páginas /termos e /privacidade. Abrem sem login (a pessoa precisa poder ler antes de criar a conta) e só em português.
 */
export type LegalKind = 'terms' | 'privacy'

function renderBlock(block: Block, i: number) {
  if (typeof block === 'string') return <p key={i} className="mt-2 text-sm leading-relaxed text-gray-700">{block}</p>
  return (
    <ul key={i} className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-gray-700">
      {block.list.map((item, j) => (
        <li key={j}>{item}</li>
      ))}
    </ul>
  )
}

export function LegalPage({ kind }: { kind: LegalKind }) {
  const title = kind === 'terms' ? TERMS_TITLE : PRIVACY_TITLE
  const other = kind === 'terms' ? { href: '/privacidade', label: PRIVACY_TITLE } : { href: '/termos', label: TERMS_TITLE }
  // Nome, CPF, endereço e e-mail do fornecedor vêm do Worker (segredos da Cloudflare), não do código.
  const seller = useSeller()
  const doc: LegalDoc | null = seller.status !== 'ready' ? null : kind === 'terms' ? buildTerms(seller.seller) : buildPrivacy(seller.seller)

  useEffect(() => {
    document.title = `CurriMaker - ${title}`
    document.documentElement.lang = 'pt-BR'
  }, [title])

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-4 pb-20">
      <header className="flex items-center justify-between gap-3 py-4 text-sm">
        <a href="/" className="text-blue-300 hover:underline">
          ← Voltar ao CurriMaker
        </a>
        <a href={other.href} className="text-blue-300 hover:underline">
          {other.label}
        </a>
      </header>

      <article className="glass rounded-lg border border-gray-200 p-5 sm:p-8">
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        {!doc && (
          <p role={seller.status === 'unavailable' ? 'alert' : undefined} className="mt-4 text-sm text-gray-700">
            {seller.status === 'unavailable' ? 'Não foi possível carregar este texto agora. Tente de novo em alguns minutos.' : 'Carregando…'}
          </p>
        )}
        {doc && (
          <>
            <p className="mt-1 text-xs text-gray-500">Última atualização: {doc.updated}</p>
            {doc.intro.map((p, i) => (
              <p key={i} className="mt-4 text-sm leading-relaxed text-gray-700">
                {p}
              </p>
            ))}
            {doc.sections.map((section, n) => (
              <section key={section.title} className="mt-7">
                <h2 className="text-base font-semibold text-gray-900">
                  {n + 1}. {section.title}
                </h2>
                {section.blocks.map(renderBlock)}
              </section>
            ))}
          </>
        )}
      </article>
    </div>
  )
}
