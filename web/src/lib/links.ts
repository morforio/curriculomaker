/**
 * Parte fixa do endereço de perfis conhecidos. Ao clicar no campo do endereço de um link chamado "LinkedIn" ou "GitHub",
 * o início do endereço já aparece preenchido e a pessoa só completa o usuário.
 */
const PREFIXES: Record<string, string> = {
  linkedin: 'https://linkedin.com/in/',
  github: 'https://github.com/',
}

export const LINKEDIN_PREFIX = PREFIXES.linkedin
export const GITHUB_PREFIX = PREFIXES.github

/** Início do endereço para o nome do link (sem diferenciar maiúsculas), ou null se o nome não for de um perfil conhecido. */
export function linkPrefix(label: string): string | null {
  return PREFIXES[label.trim().toLowerCase()] ?? null
}

/** O endereço é só o início preenchido automaticamente, sem usuário? Então a pessoa não chegou a preencher. */
export function isOnlyPrefix(url: string): boolean {
  const u = url.trim()
  return Object.values(PREFIXES).includes(u)
}
