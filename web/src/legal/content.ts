import { FREE_CREDITS, FREE_DAYS, PRO_ACCESS_DAYS, PRO_CREDITS, PRO_PRICE_BRL } from '../lib/plans.ts'
import type { Seller } from '../lib/seller.ts'

/**
 * Textos dos Termos de uso e da Política de privacidade (só em português do Brasil).
 * Valores (preço, créditos, prazos) vêm das mesmas constantes que o resto do sistema usa (src/lib/plans.ts): o texto não desatualiza sozinho.
 * Se um fornecedor de serviço novo passar a receber dados do usuário, ele precisa entrar na seção 4 da Política.
 * Os dados do fornecedor (nome, CPF, endereço e e-mail) NÃO ficam no código: o Worker os serve em /api/seller, lendo-os dos segredos
 * SELLER_* da Cloudflare (worker/seller.ts). Por isso os textos são funções que recebem o fornecedor.
 */
export const LEGAL_UPDATED = '12 de outubro de 2026'
export const TERMS_TITLE = 'Termos de uso'
export const PRIVACY_TITLE = 'Política de privacidade'

export type Block = string | { list: string[] }
export type LegalSection = { title: string; blocks: Block[] }
export type LegalDoc = { title: string; updated: string; intro: string[]; sections: LegalSection[] }

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const identityOf = (seller: Seller) => `${seller.name}, CPF ${seller.cpf}, com endereço em ${seller.address}, e-mail de contato ${seller.email}`

export const buildTerms = (seller: Seller): LegalDoc => ({
  title: TERMS_TITLE,
  updated: LEGAL_UPDATED,
  intro: [
    'Estes termos explicam como funciona o CurriMaker, o que você pode esperar dele e o que é de responsabilidade de cada parte. Ao criar uma conta ou contratar um plano, você concorda com eles. Se não concordar, não use o serviço.',
  ],
  sections: [
    {
      title: 'Quem oferece o serviço',
      blocks: [
        `O CurriMaker é oferecido por ${identityOf(seller)} (“nós”). Estes são os dados do fornecedor exigidos pela legislação do comércio eletrônico. É por esse e-mail que você fala conosco sobre qualquer assunto destes termos.`,
      ],
    },
    {
      title: 'O que é o CurriMaker',
      blocks: [
        'O CurriMaker é um editor de currículos que funciona no navegador. Com ele você monta o seu currículo em blocos, importa um currículo em PDF, adapta a introdução e compara habilidades com uma vaga usando inteligência artificial (IA), traduz o currículo entre português e inglês e exporta o resultado em PDF.',
        'O serviço é uma ferramenta de apoio. Não garantimos entrevista, contratação nem que um sistema de triagem de currículos (ATS) vá aprovar o seu currículo. O formato do PDF foi pensado para ser lido por esses sistemas, mas o resultado depende de cada empresa.',
        'A IA ajuda a sugerir textos e traduções, mas pode errar. Veja a seção sobre inteligência artificial.',
      ],
    },
    {
      title: 'Cadastro e conta',
      blocks: [
        'Para usar o CurriMaker você cria uma conta com e-mail e senha e confirma o e-mail pelo link que enviamos. Você deve ter 18 anos ou mais (ou ser maior de 16 anos e estar assistido por responsável legal).',
        'Você é responsável por manter a senha em sigilo e por tudo o que for feito na sua conta. Se suspeitar de uso indevido, troque a senha (“Esqueci minha senha”) e nos avise.',
        'Informe dados verdadeiros. Cada pessoa deve ter uma única conta; não é permitido criar várias contas para obter créditos gratuitos repetidamente.',
      ],
    },
    {
      title: 'Planos, créditos e preços',
      blocks: [
        'O CurriMaker funciona com créditos. Há dois planos:',
        {
          list: [
            `Gratuito (${brl(0)}): ${FREE_CREDITS} créditos, válidos por ${FREE_DAYS} dias a partir da criação da conta. Não renova. Na conta gratuita, cada uso da IA (análise de vaga), cada tradução e cada exportação de PDF gasta 1 crédito.`,
            `Pro (${brl(PRO_PRICE_BRL)} por mês): ${PRO_CREDITS} créditos por mês para a IA e a tradução. Exportar o PDF não gasta crédito. Todos os recursos ficam liberados.`,
          ],
        },
        `Cada pagamento confirmado do plano Pro dá acesso por ${PRO_ACCESS_DAYS} dias e repõe o pacote para ${PRO_CREDITS} créditos. Créditos não usados não se acumulam para o mês seguinte, não valem dinheiro e não podem ser transferidos.`,
        'Se o serviço de IA falhar e você não receber o resultado, o crédito gasto é devolvido automaticamente.',
        'Sem crédito válido e sem plano Pro ativo, a conta fica em modo bloqueado: você continua vendo e editando os textos do seu currículo, mas ficam bloqueados reordenar, adicionar e apagar blocos, importar PDF, trocar de idioma, usar a IA e exportar o PDF. Seus dados não são apagados.',
      ],
    },
    {
      title: 'Pagamento, renovação e cancelamento',
      blocks: [
        'O plano Pro é uma assinatura mensal que se renova todo mês até você cancelar. O pagamento é processado pelo Asaas Gestão Financeira Instituição de Pagamento S.A., por Pix, cartão de crédito ou boleto, na página de pagamento do Asaas. Os dados do cartão são digitados lá e não passam por nós.',
        {
          list: [
            'Cartão de crédito: a cobrança se repete automaticamente todo mês.',
            'Pix e boleto: o Asaas gera uma nova cobrança a cada mês e você precisa pagá-la. O plano só é renovado depois que o pagamento é confirmado.',
          ],
        },
        'Você pode cancelar a qualquer momento, sem multa, pelo botão “Cancelar assinatura” na página Planos. Depois do cancelamento não há novas cobranças, e o plano Pro continua até o fim do período já pago. Terminado esse período, a conta volta ao plano gratuito.',
        `Para pedir a assinatura, você informa nome completo e CPF, exigidos pelo Asaas para gerar a cobrança. O CPF é enviado ao Asaas e não é guardado por nós.`,
        'Se o preço mudar, avisaremos com pelo menos 30 dias de antecedência. O novo preço vale para as renovações posteriores ao aviso, e você pode cancelar antes.',
        'Se uma cobrança for estornada ou contestada junto ao banco ou à operadora do cartão (chargeback), o plano Pro é encerrado.',
      ],
    },
    {
      title: 'Direito de arrependimento e reembolso',
      blocks: [
        `Quem contrata pela internet pode desistir em até 7 dias corridos a contar da primeira contratação do plano Pro (art. 49 do Código de Defesa do Consumidor). Nesse prazo devolvemos o valor integral pago, sem perguntas e sem desconto, pelo mesmo meio de pagamento, em até 10 dias úteis após o seu pedido. O prazo para o valor aparecer na fatura do cartão depende da operadora.`,
        'Também devolvemos o valor de cobrança indevida ou duplicada. Se uma falha nossa o impedir de usar o plano por um período relevante, analisamos o caso e oferecemos reembolso proporcional ou crédito.',
        `Para pedir reembolso, escreva para ${seller.email} com o e-mail da sua conta e a data do pagamento. O reembolso encerra o plano Pro.`,
        'Fora desses casos, o cancelamento vale para as próximas cobranças e não gera reembolso do período já iniciado.',
      ],
    },
    {
      title: 'Uso da inteligência artificial',
      blocks: [
        'A análise de vaga e a tradução usam modelos de IA de terceiros. As instruções que damos a eles proíbem inventar informações e, na análise de vaga, a introdução sugerida é conferida por regras automáticas e por um segundo sistema de verificação. Mesmo assim, a IA pode errar, simplificar ou interpretar mal um texto, e a tradução não passa por essa conferência de fidelidade.',
        'Você é o único responsável pelo conteúdo do seu currículo. Leia e confira tudo, principalmente datas, cargos, empresas, resultados e números, antes de aplicar uma sugestão ou enviar o currículo a qualquer empresa. Não use o CurriMaker para afirmar o que não é verdade.',
        'O resultado da IA pode variar a cada uso. Não garantimos que ele seja completo ou adequado a uma vaga específica.',
      ],
    },
    {
      title: 'Regras de uso',
      blocks: [
        'Você concorda em não:',
        {
          list: [
            'usar o serviço para fraude, para falsificar experiência ou formação, ou para qualquer fim ilegal;',
            'enviar dados de outras pessoas sem autorização delas;',
            'tentar burlar limites de uso, créditos, pagamento ou travas do sistema, nem acessar dados de outros usuários;',
            'sobrecarregar o serviço, copiar ou revender o software, ou usar robôs para acessá-lo;',
            'enviar conteúdo ofensivo, ilegal ou que viole direitos de terceiros.',
          ],
        },
      ],
    },
    {
      title: 'Seu conteúdo e seus dados',
      blocks: [
        'O conteúdo do seu currículo é seu. Você nos autoriza apenas a guardá-lo, processá-lo e enviá-lo aos prestadores de serviço descritos na Política de privacidade, na medida necessária para o serviço funcionar. O software, a marca e o layout do CurriMaker são nossos.',
        'Como tratamos dados pessoais está na Política de privacidade, que faz parte destes termos.',
      ],
    },
    {
      title: 'Disponibilidade e limites de responsabilidade',
      blocks: [
        'Nos esforçamos para manter o serviço no ar, mas ele depende de terceiros (hospedagem, banco de dados, IA e pagamento) e pode ficar indisponível ou lento, inclusive para manutenção. Não prometemos funcionamento ininterrupto.',
        'Faça uma cópia do seu currículo (por exemplo, exportando o PDF) sempre que ele for importante.',
        'Dentro do que a lei permite, não respondemos por danos indiretos, nem por oportunidades de emprego não obtidas, e a nossa responsabilidade total fica limitada ao valor que você pagou nos 12 meses anteriores ao fato. Isso não afasta direitos que a lei garante ao consumidor e não se aplica a dolo ou culpa grave nossa.',
        'O Asaas é um intermediário de pagamento. Questões sobre o produto ou o serviço contratado devem ser tratadas conosco, pelo e-mail acima.',
      ],
    },
    {
      title: 'Suspensão e encerramento',
      blocks: [
        'Você pode parar de usar o CurriMaker quando quiser e pedir a exclusão da conta pelo e-mail de contato. Cancele a assinatura antes, se houver.',
        'Podemos suspender ou encerrar contas que violem estes termos, tentem fraude ou abuso do sistema, ou estejam envolvidas em estorno indevido, avisando você sempre que possível. Em caso de encerramento sem culpa sua, devolvemos o valor proporcional do período já pago e não usado.',
      ],
    },
    {
      title: 'Alterações destes termos',
      blocks: [
        'Podemos atualizar estes termos. Mudanças relevantes serão avisadas no site ou por e-mail com pelo menos 30 dias de antecedência, e a data da última atualização aparece no topo desta página. Se você não concordar, pode cancelar antes de a mudança valer.',
      ],
    },
    {
      title: 'Lei aplicável e contato',
      blocks: [
        'Estes termos seguem a lei brasileira. Fica eleito o foro do domicílio do consumidor para resolver qualquer conflito.',
        `Dúvidas, reclamações, pedidos de reembolso ou de exclusão de conta: ${seller.email}.`,
      ],
    },
  ],
})

export const buildPrivacy = (seller: Seller): LegalDoc => ({
  title: PRIVACY_TITLE,
  updated: LEGAL_UPDATED,
  intro: [
    'Esta política explica quais dados pessoais o CurriMaker trata, para quê, com quem compartilha e quais são os seus direitos, conforme a Lei Geral de Proteção de Dados (LGPD, Lei 13.709/2018).',
  ],
  sections: [
    {
      title: 'Quem é o responsável pelos dados',
      blocks: [
        `O responsável (controlador) é ${identityOf(seller)}. É por esse e-mail que você exerce os seus direitos e tira dúvidas sobre privacidade. Esse também é o canal do encarregado pelo tratamento de dados.`,
      ],
    },
    {
      title: 'Quais dados tratamos',
      blocks: [
        {
          list: [
            'Conta: o seu e-mail e a sua senha. A senha é guardada de forma protegida pelo serviço de autenticação, e nós não temos acesso a ela.',
            'Currículo: tudo o que você digita ou importa (nome, contatos, links, cargo, experiências, formação, habilidades, idiomas e outros blocos), em português e inglês. O PDF que você importa é lido no seu navegador e o arquivo não é enviado a nós.',
            'Vaga: o texto que você cola para a análise. Ele é enviado ao serviço de IA e não é guardado no nosso banco, assim como o resultado da análise.',
            'Pagamento: o nome completo e o CPF que você digita na página de planos vão ao Asaas para gerar a cobrança; nós não guardamos o CPF. Guardamos só identificadores do seu cadastro, da sua assinatura e das cobranças pagas no Asaas, o plano, o saldo de créditos e a validade. Os dados de cartão, Pix e boleto são digitados na página do Asaas e não passam por nós.',
            'Dados técnicos: endereço IP, data e hora, tipo de navegador e erros, registrados pelos serviços de hospedagem e de banco de dados para segurança e diagnóstico.',
            'No seu navegador: uma cópia local do currículo (apagada quando você sai da conta), a sessão de login, o idioma e a preferência de animações.',
          ],
        },
        'O CurriMaker não pede dados pessoais sensíveis (como saúde, religião ou origem racial). Se você os incluir por conta própria no currículo, recomendamos que não o faça, e eles serão tratados apenas para o serviço funcionar.',
      ],
    },
    {
      title: 'Para que usamos e em que base legal',
      blocks: [
        {
          list: [
            'Criar e manter a sua conta, guardar e processar o seu currículo, executar a análise de vaga, a tradução e a exportação: execução do contrato (LGPD, art. 7º, V).',
            'Cobrar, controlar créditos e plano, cumprir obrigações legais e fiscais e atender a reembolsos: execução do contrato e cumprimento de obrigação legal (art. 7º, II e V).',
            'Enviar e-mails do serviço (confirmação de cadastro, recuperação de senha, cobrança): execução do contrato. Não enviamos propaganda.',
            'Segurança, prevenção a fraude e abuso (captcha, limites de uso, registros técnicos) e diagnóstico de falhas: legítimo interesse (art. 7º, IX).',
            'Exercer direitos em eventual disputa: exercício regular de direitos (art. 7º, VI).',
          ],
        },
        'Não vendemos os seus dados e não os usamos para propaganda nem para treinar modelos de IA.',
      ],
    },
    {
      title: 'Com quem compartilhamos',
      blocks: [
        'Para o serviço funcionar, usamos prestadores (operadores) que tratam dados em nosso nome, cada um só para a sua função:',
        {
          list: [
            'Supabase (autenticação e banco de dados, com o projeto hospedado em São Paulo): e-mail, senha protegida, currículos, plano e créditos.',
            'Cloudflare (hospedagem do site, rede de entrega, registros do servidor e proteção contra robôs “Turnstile”): dados técnicos e o tráfego do serviço.',
            'OpenRouter e os provedores dos modelos de IA que ele aciona (modelos gpt-oss): o texto do currículo, a introdução e o texto da vaga, nas funções de análise de vaga e tradução. Não enviamos o seu nome, e-mail, telefone, cidade nem links.',
            'TypeSafe (conferência da introdução sugerida): o texto do currículo sem dados de contato, a introdução sugerida e o texto da vaga.',
            'Resend (envio de e-mails do serviço): o seu e-mail e o conteúdo da mensagem enviada.',
            'Asaas Gestão Financeira Instituição de Pagamento S.A. (pagamentos): nome, CPF, e-mail e dados da cobrança.',
          ],
        },
        'Também podemos compartilhar dados com autoridades quando a lei exigir. Esses prestadores tratam os dados segundo as próprias políticas de privacidade, além do que combinamos com eles.',
      ],
    },
    {
      title: 'Transferência para o exterior',
      blocks: [
        'Alguns desses prestadores (como Cloudflare, OpenRouter, TypeSafe e Resend) podem tratar dados fora do Brasil, inclusive nos Estados Unidos. Isso acontece porque é necessário para executar o serviço que você contratou (LGPD, art. 33). Escolhemos prestadores que adotam medidas de segurança compatíveis com a lei.',
      ],
    },
    {
      title: 'Por quanto tempo guardamos',
      blocks: [
        {
          list: [
            'Conta, currículos, plano e créditos: enquanto a conta existir. Quando você pede a exclusão, apagamos esses dados, e os vínculos de cobrança, do nosso banco.',
            'Dados de cobrança: o Asaas e nós podemos manter registros dos pagamentos pelo prazo exigido pela legislação fiscal e regulatória.',
            'Registros técnicos: por período limitado, conforme a configuração dos provedores de hospedagem e de banco de dados.',
            'Cópia local no navegador: apagada ao sair da conta.',
          ],
        },
      ],
    },
    {
      title: 'Seus direitos',
      blocks: [
        'Você pode pedir a qualquer momento, pelo e-mail de contato:',
        {
          list: [
            'confirmação de que tratamos seus dados e acesso a eles;',
            'correção de dados incompletos, inexatos ou desatualizados;',
            'anonimização, bloqueio ou eliminação de dados desnecessários ou tratados sem base legal;',
            'portabilidade dos dados;',
            'informação sobre com quem compartilhamos os dados;',
            'eliminação dos dados tratados com o seu consentimento e revogação do consentimento;',
            'oposição a um tratamento feito sem o seu consentimento, se você entender que ele descumpre a lei.',
          ],
        },
        'Respondemos em até 15 dias. Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD). Para excluir a conta, cancele a assinatura (se houver) e peça a exclusão pelo e-mail; os dados do Asaas, se for o caso, devem ser pedidos também a ele.',
      ],
    },
    {
      title: 'Segurança',
      blocks: [
        'Adotamos medidas técnicas para proteger os dados: conexão criptografada (HTTPS), isolamento dos dados de cada usuário no banco, chaves secretas guardadas apenas no servidor, proteção contra robôs no login, limites de uso e confirmação do e-mail. O cartão não passa por nós e o CPF não é guardado.',
        'Nenhum sistema é totalmente seguro. Se ocorrer um incidente que possa causar risco ou dano relevante, comunicaremos você e a ANPD, como a lei determina.',
      ],
    },
    {
      title: 'Cookies e armazenamento no navegador',
      blocks: [
        'Não usamos cookies de propaganda nem de rastreamento e não usamos ferramentas de análise de comportamento. Usamos o armazenamento local do navegador para manter a sua sessão, o idioma, a preferência de animações e uma cópia do currículo enquanto você está conectado. A proteção contra robôs (Cloudflare Turnstile) pode usar o armazenamento do navegador para funcionar.',
      ],
    },
    {
      title: 'Crianças e adolescentes',
      blocks: ['O CurriMaker não é direcionado a menores de 18 anos. Se você é responsável por um menor que criou conta, escreva para o e-mail de contato e excluiremos os dados.'],
    },
    {
      title: 'Alterações e contato',
      blocks: [
        'Podemos atualizar esta política. A data da última atualização aparece no topo, e mudanças relevantes serão avisadas no site ou por e-mail.',
        `Contato sobre privacidade: ${seller.email}.`,
      ],
    },
  ],
})
