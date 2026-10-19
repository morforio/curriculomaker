/**
 * Fatos que o usuário declara no próprio pedido ("possuo pós-graduação em engenharia de software"): só formação, certificação e curso
 * valem (nunca anos, números ou resultados). Usado pelo Worker (esses termos não contam como "habilidade que o currículo não tem") e pela
 * tela (marca os tópicos "informado por você").
 */

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

// Já sem acento nem pontuação ("pós-graduação" vira "pos graduacao").
const CREDENCIAL =
  /\b(pos graduacao|pos graduado|pos graduada|graduacao|mestrado|doutorado|especializacao|mba|bacharel\w*|licenciatura|tecnolog\w*|curso|certificacao|certificado|certificada|bootcamp|diploma|formei|formado|formada|degree|masters?|phd|postgraduate|post graduate|graduate|certificate|certification|course)\b/

/** Orações do pedido que falam de formação, certificação ou curso (normalizadas). "Diga que tenho 5 anos de X e que fiz mestrado" separa as duas partes. */
export function credentialClauses(request: string): string[] {
  return request
    .split(/[.;!?\n]|,|\s+e\s+|\s+and\s+/i)
    .map(norm)
    .filter((c) => c.length > 0 && CREDENCIAL.test(c))
}

/** A habilidade citada aparece numa oração de formação/certificação/curso do pedido? */
export function isStatedCredential(skillName: string, request: string): boolean {
  const key = norm(skillName)
  if (key.length < 3) return false
  return credentialClauses(request).some((c) => ` ${c} `.includes(` ${key} `))
}

const FUNC = new Set(['para', 'com', 'sem', 'uma', 'que', 'por', 'dos', 'das', 'sobre', 'entre', 'with', 'from', 'that', 'this', 'your'])

/** Linhas do texto sugerido que trazem palavra do pedido (em oração de formação) e que não existe no currículo: o que o usuário informou. */
export function statedByCandidate(lines: string[], resumeSource: string, request: string): string[] {
  const clauseWords = new Set(credentialClauses(request).flatMap((c) => c.split(' ')))
  if (clauseWords.size === 0) return []
  const inResume = new Set(norm(resumeSource).split(' '))
  return lines.filter((line) =>
    norm(line)
      .split(' ')
      .some((w) => w.length > 4 && !FUNC.has(w) && clauseWords.has(w) && !inResume.has(w)),
  )
}
