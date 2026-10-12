/**
 * Dados do fornecedor, mostrados nos Termos de uso e na Política de privacidade.
 * A lei do comércio eletrônico (Decreto 7.962/2013) exige, em local de destaque no site: nome, CPF ou CNPJ, endereço físico e
 * eletrônico e meios de contato do fornecedor. O teste tests/legal.test.ts falha enquanto algum campo estiver vazio ou inválido:
 * este arquivo precisa estar completo antes de os textos irem ao ar.
 */
export const SELLER = {
  name: 'Lucas Teixeira de Andrade Morforio da Cruz',
  /** Só números ou com pontuação; o teste confere os dígitos verificadores. */
  cpf: '106.569.696-52',
  /** Endereço completo (rua, número, bairro, cidade, UF e CEP). */
  address: 'Rua Julio Silva, 121, apto 101, bairro Tupã, Visconde do Rio Branco - MG, CEP 36520-000',
  /** Caixa de e-mail que existe e é lida: é por ela que o cliente pede reembolso, exclusão de conta e atendimento. */
  email: 'lucasmorforio.niuai@gmail.com',
}

/** Data da última atualização dos textos legais. */
export const LEGAL_UPDATED = '12 de outubro de 2026'
