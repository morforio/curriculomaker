import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { fragmentsToLines, type Fragment } from './groupLines'

export const MAX_PDF_BYTES = 10 * 1024 * 1024
export const MAX_PDF_PAGES = 15

/** Lê o texto do PDF no navegador (nada é enviado a servidor). */
export async function extractPdfLines(data: ArrayBuffer): Promise<{ lines: string[]; pages: number; truncated: boolean }> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  const task = pdfjs.getDocument({ data: new Uint8Array(data) })
  const doc = await task.promise
  try {
    const pages = Math.min(doc.numPages, MAX_PDF_PAGES)
    const lines: string[] = []
    for (let n = 1; n <= pages; n++) {
      const page = await doc.getPage(n)
      const content = await page.getTextContent()
      const fragments: Fragment[] = []
      for (const item of content.items) {
        if (!('str' in item)) continue
        fragments.push({
          str: item.str,
          x: item.transform[4],
          y: item.transform[5],
          width: item.width,
          height: item.height,
        })
      }
      lines.push(...fragmentsToLines(fragments))
    }
    return { lines, pages: doc.numPages, truncated: doc.numPages > MAX_PDF_PAGES }
  } finally {
    await task.destroy()
  }
}
