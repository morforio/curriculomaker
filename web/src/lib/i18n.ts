import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

export type Lang = 'pt' | 'en'
export const LANG_NAMES: Record<Lang, string> = { pt: 'Português (BR)', en: 'English' }
const LANG_KEY = 'currimaker:lang'

const resources = {
  pt: {
    translation: {
      app: { name: 'CurriMaker' },
      analysis: {
        title: 'Adequar à vaga',
        intro:
          'Cole a descrição da vaga. A IA sugere ajustes pontuais na introdução e compara as habilidades pedidas com as do seu currículo. Ela não inventa informações: só usa o que está no seu currículo.',
        jobLabel: 'Descrição da vaga',
        jobPlaceholder: 'Cole aqui o texto completo da vaga…',
        chars: '{{count}} / {{max}} caracteres',
        tooShort: 'Cole pelo menos {{min}} caracteres da vaga.',
        needResume: 'Preencha o currículo (por exemplo, a introdução e as habilidades) antes de analisar a vaga.',
        langNote: 'A introdução sugerida é escrita em {{lang}}, o idioma da aba ativa.',
        analyze: 'Analisar vaga',
        analyzing: 'Analisando… pode levar até 1 minuto.',
        privacy: 'O texto da vaga e o do seu currículo (sem nome, e-mail, telefone e links) são enviados ao serviço de IA para a análise e a um segundo serviço de IA, que confere se a introdução sugerida não inventa nada.',
        result: 'Resultado',
        job: 'Vaga',
        summaryTitle: 'Introdução sugerida',
        original: 'Original',
        suggested: 'Sugerida',
        noOriginal: '(você ainda não escreveu uma introdução)',
        changes: 'Alterações feitas',
        apply: 'Aplicar na introdução',
        applied: 'Aplicada na introdução',
        undo: 'Desfazer',
        skillsTitle: 'Habilidades da vaga × seu currículo',
        required: 'Obrigatória',
        preferred: 'Desejável',
        status: { has: 'Possui', partial: 'Parcial', missing: 'Não possui' },
        skill: 'Habilidade',
        importance: 'Importância',
        situation: 'Situação',
        evidence: 'Trecho do currículo',
        addSkill: 'Eu tenho: adicionar',
        added: 'Adicionada',
        otherSkills: 'Outras habilidades',
        coverage: '{{have}} de {{total}} habilidades obrigatórias atendidas (contando as parciais)',
        keywords: 'Palavras-chave da vaga',
        quality: {
          verified: 'Conferida: não inventa nem muda o sentido do original e está ajustada à vaga.',
          bestEffort: 'Melhor versão encontrada, mas ainda abaixo do limite de qualidade (0,80). Revise com atenção antes de aplicar.',
          scores: '(fidelidade {{fidelity}} · adequação à vaga {{adequacy}}, de 0 a 1)',
          redone: 'Refeita {{count}} vez(es).',
          failed: 'Não foi possível conferir esta sugestão desta vez. Leia com atenção antes de aplicar.',
        },
        downgraded:
          '{{count}} habilidade(s) que a IA marcou como "possui" foram rebaixadas para "não possui" porque o trecho citado não foi encontrado no currículo.',
        err: {
          invalid_request: 'Não foi possível enviar: confira o texto da vaga e o currículo.',
          forbidden_origin: 'Pedido bloqueado por segurança. Recarregue a página e tente de novo.',
          rate_limited_ip: 'Você atingiu o limite de análises por hora. Tente novamente mais tarde.',
          rate_limited_daily: 'O limite diário de análises do serviço foi atingido. Tente novamente amanhã.',
          not_configured: 'O serviço de IA ainda não está configurado.',
          llm_unavailable: 'O serviço de IA está indisponível no momento. Tente novamente em instantes.',
          bad_llm_output: 'A IA devolveu uma resposta fora do formato. Tente novamente.',
          network: 'Sem conexão com o servidor. Verifique a internet e tente de novo.',
        },
      },
      import: {
        button: 'Importar PDF',
        title: 'Importar currículo em PDF',
        intro:
          'Envie o seu currículo em PDF. O texto é lido aqui no seu navegador (nada é enviado a servidor) e nada é reescrito: o texto de cada bloco é copiado exatamente como está no arquivo.',
        choose: 'Escolher arquivo PDF',
        reading: 'Lendo o arquivo…',
        recognized: 'Este foi o texto que foi possível reconhecer. Se houver qualquer outro texto, adicione manualmente no editor.',
        headerFound: 'Dados de contato reconhecidos',
        blocks: 'Blocos reconhecidos',
        lines: '{{count}} linhas',
        rowsCount: '{{count}} tópicos/linhas',
        noSections:
          'Nenhum título de seção foi reconhecido (ex.: Experiência, Formação, Habilidades). Você pode importar só os dados de contato e adicionar o resto manualmente.',
        leftover: 'Texto do topo não reconhecido (não será importado)',
        confirm: 'Importar para o editor',
        cancel: 'Cancelar',
        another: 'Escolher outro arquivo',
        langWarning:
          'É importante que a aba de idioma selecionada ({{lang}}) seja do mesmo idioma do currículo que será carregado. Se não for, aperte Cancelar e altere a aba; se for, aperte OK.',
        confirmReplace: 'Isso substitui o currículo atual no editor. Continuar?',
        truncated: 'O PDF tem {{pages}} páginas; só as primeiras {{max}} foram lidas.',
        errType: 'Escolha um arquivo PDF.',
        errSize: 'O arquivo passa de 10 MB.',
        errNoText: 'Não foi possível ler texto neste PDF. Ele pode ser um documento escaneado (imagem). Preencha manualmente no editor.',
        errRead: 'Não foi possível ler este PDF. Ele pode estar protegido por senha ou corrompido.',
      },
      toolbar: { exportPdf: 'Exportar PDF', reset: 'Limpar tudo', confirmReset: 'Apagar todo o currículo desta aba?' },
      tabs: {
        label: 'Idioma do currículo',
        askTitle: 'Traduzir o currículo?',
        ask: 'Você já tem parte do seu currículo preenchido em {{from}}. Deseja traduzir o que já foi preenchido para {{to}}?',
        yes: 'Sim',
        no: 'Não',
        translating: 'Traduzindo… pode levar até 1 minuto.',
        err: {
          invalid_request: 'Não foi possível enviar o currículo para tradução.',
          forbidden_origin: 'Pedido bloqueado por segurança. Recarregue a página e tente de novo.',
          rate_limited_ip: 'Você atingiu o limite de traduções por hora. Tente novamente mais tarde ou responda Não para abrir a aba vazia.',
          rate_limited_daily: 'O limite diário de traduções do serviço foi atingido. Tente novamente amanhã ou responda Não para abrir a aba vazia.',
          not_configured: 'O serviço de IA ainda não está configurado.',
          llm_unavailable: 'O serviço de IA está indisponível no momento. Tente novamente em instantes.',
          bad_llm_output: 'A IA devolveu uma resposta fora do formato. Tente novamente.',
          network: 'Sem conexão com o servidor. Verifique a internet e tente de novo.',
        },
      },
      header: { title: 'Dados pessoais', fullName: 'Nome completo', headline: 'Cargo / título', email: 'E-mail', phone: 'Telefone', location: 'Cidade, UF', links: 'Links (LinkedIn, GitHub…)', linkLabel: 'Nome', linkUrl: 'Endereço', addLink: 'Adicionar link', removeLink: 'Remover link' },
      sections: { title: 'Blocos do currículo', add: 'Adicionar bloco', addButton: 'Adicionar', empty: 'Nenhum bloco. Adicione um acima.' },
      sectionType: {
        summary: 'Resumo Profissional',
        experience: 'Experiência Profissional',
        education: 'Formação Acadêmica',
        skills: 'Habilidades',
        languages: 'Idiomas',
        custom: 'Outros',
      },
      contact: { email: 'E-mail', phone: 'Telefone', location: 'Localização' },
      card: { drag: 'Arrastar para reordenar', up: 'Mover para cima', down: 'Mover para baixo', remove: 'Remover bloco', collapse: 'Recolher', expand: 'Expandir', title: 'Título do bloco' },
      form: {
        summaryText: 'Texto da introdução',
        customText: 'Texto',
        addItem: 'Adicionar item',
        removeItem: 'Remover item',
        company: 'Empresa',
        role: 'Cargo',
        period: 'Período',
        location: 'Local',
        description: 'Descrição (uma linha por tópico)',
        institution: 'Instituição',
        degree: 'Curso / grau',
        skillGroup: 'Grupo (opcional)',
        skillItems: 'Habilidades (separadas por vírgula)',
        language: 'Idioma',
        level: 'Nível',
        periodPlaceholder: 'MM/AAAA – Presente',
        boldHint: 'Dica: use **texto** para negrito.',
        topic: 'Tópico',
        topicPlaceholder: 'Tópico (opcional)',
        rowText: 'Texto',
        addRow: 'Adicionar tópico',
        removeRow: 'Remover tópico',
        rowsHint:
          'Deixe o tópico vazio para escrever um texto livre. Use **texto** para negrito e comece a linha com - ou • para criar marcadores.',
      },
      preview: { title: 'Pré-visualização', placeholderName: 'Seu nome' },
    },
  },
  en: {
    translation: {
      app: { name: 'CurriMaker' },
      analysis: {
        title: 'Tailor to a job',
        intro:
          'Paste the job description. The AI suggests targeted edits to your summary and compares the skills the job asks for with the ones in your resume. It never invents information: it only uses what is in your resume.',
        jobLabel: 'Job description',
        jobPlaceholder: 'Paste the full job posting here…',
        chars: '{{count}} / {{max}} characters',
        tooShort: 'Paste at least {{min}} characters of the job posting.',
        needResume: 'Fill in your resume (for example the summary and skills) before analyzing a job.',
        langNote: 'The suggested summary is written in {{lang}}, the language of the active tab.',
        analyze: 'Analyze job',
        analyzing: 'Analyzing… this can take up to 1 minute.',
        privacy: 'The job text and your resume text (without name, email, phone and links) are sent to the AI service for the analysis and to a second AI service that checks the suggested summary does not invent anything.',
        result: 'Result',
        job: 'Job',
        summaryTitle: 'Suggested summary',
        original: 'Original',
        suggested: 'Suggested',
        noOriginal: '(you have not written a summary yet)',
        changes: 'Edits made',
        apply: 'Apply to summary',
        applied: 'Applied to summary',
        undo: 'Undo',
        skillsTitle: 'Job skills × your resume',
        required: 'Required',
        preferred: 'Nice to have',
        status: { has: 'Has', partial: 'Partial', missing: 'Missing' },
        skill: 'Skill',
        importance: 'Importance',
        situation: 'Status',
        evidence: 'Resume excerpt',
        addSkill: 'I have it: add',
        added: 'Added',
        otherSkills: 'Other skills',
        coverage: '{{have}} of {{total}} required skills covered (counting partial ones)',
        keywords: 'Job keywords',
        quality: {
          verified: 'Checked: it does not invent anything or change the meaning of the original, and it is tailored to the job.',
          bestEffort: 'Best version found, but still below the quality threshold (0.80). Review it carefully before applying.',
          scores: '(fidelity {{fidelity}} · job fit {{adequacy}}, on a 0 to 1 scale)',
          redone: 'Rewritten {{count}} time(s).',
          failed: 'This suggestion could not be checked this time. Read it carefully before applying.',
        },
        downgraded:
          '{{count}} skill(s) the AI marked as "has" were downgraded to "missing" because the quoted excerpt was not found in your resume.',
        err: {
          invalid_request: 'Could not send: check the job text and your resume.',
          forbidden_origin: 'Request blocked for security. Reload the page and try again.',
          rate_limited_ip: 'You reached the hourly analysis limit. Try again later.',
          rate_limited_daily: 'The service daily analysis limit was reached. Try again tomorrow.',
          not_configured: 'The AI service is not configured yet.',
          llm_unavailable: 'The AI service is unavailable right now. Try again in a moment.',
          bad_llm_output: 'The AI returned a reply in the wrong format. Try again.',
          network: 'No connection to the server. Check your internet and try again.',
        },
      },
      import: {
        button: 'Import PDF',
        title: 'Import resume from PDF',
        intro:
          'Upload your resume as a PDF. The text is read here in your browser (nothing is sent to a server) and nothing is rewritten: the text of each block is copied exactly as it is in the file.',
        choose: 'Choose PDF file',
        reading: 'Reading the file…',
        recognized: 'This is the text that could be recognized. If there is any other text, add it manually in the editor.',
        headerFound: 'Contact details recognized',
        blocks: 'Blocks recognized',
        lines: '{{count}} lines',
        rowsCount: '{{count}} topics/lines',
        noSections:
          'No section heading was recognized (e.g. Experience, Education, Skills). You can import only the contact details and add the rest manually.',
        leftover: 'Unrecognized text at the top (will not be imported)',
        confirm: 'Import into the editor',
        cancel: 'Cancel',
        another: 'Choose another file',
        langWarning:
          'It is important that the selected language tab ({{lang}}) matches the language of the resume you are about to upload. If it does not, press Cancel and change the tab; if it does, press OK.',
        confirmReplace: 'This replaces the current resume in the editor. Continue?',
        truncated: 'The PDF has {{pages}} pages; only the first {{max}} were read.',
        errType: 'Choose a PDF file.',
        errSize: 'The file is larger than 10 MB.',
        errNoText: 'No text could be read from this PDF. It may be a scanned document (image). Fill it in manually in the editor.',
        errRead: 'This PDF could not be read. It may be password-protected or corrupted.',
      },
      toolbar: { exportPdf: 'Export PDF', reset: 'Clear all', confirmReset: 'Delete the whole resume in this tab?' },
      tabs: {
        label: 'Resume language',
        askTitle: 'Translate the resume?',
        ask: 'You already have part of your resume filled in {{from}}. Do you want to translate what you filled in to {{to}}?',
        yes: 'Yes',
        no: 'No',
        translating: 'Translating… this can take up to 1 minute.',
        err: {
          invalid_request: 'Could not send the resume for translation.',
          forbidden_origin: 'Request blocked for security. Reload the page and try again.',
          rate_limited_ip: 'You reached the hourly translation limit. Try again later or answer No to open an empty tab.',
          rate_limited_daily: 'The service daily translation limit was reached. Try again tomorrow or answer No to open an empty tab.',
          not_configured: 'The AI service is not configured yet.',
          llm_unavailable: 'The AI service is unavailable right now. Try again in a moment.',
          bad_llm_output: 'The AI returned a reply in the wrong format. Try again.',
          network: 'No connection to the server. Check your internet and try again.',
        },
      },
      header: { title: 'Personal details', fullName: 'Full name', headline: 'Job title', email: 'Email', phone: 'Phone', location: 'City, State', links: 'Links (LinkedIn, GitHub…)', linkLabel: 'Name', linkUrl: 'Address', addLink: 'Add link', removeLink: 'Remove link' },
      sections: { title: 'Resume blocks', add: 'Add block', addButton: 'Add', empty: 'No blocks. Add one above.' },
      sectionType: {
        summary: 'Professional Summary',
        experience: 'Work Experience',
        education: 'Education',
        skills: 'Skills',
        languages: 'Languages',
        custom: 'Additional',
      },
      contact: { email: 'Email', phone: 'Phone', location: 'Location' },
      card: { drag: 'Drag to reorder', up: 'Move up', down: 'Move down', remove: 'Remove block', collapse: 'Collapse', expand: 'Expand', title: 'Block title' },
      form: {
        summaryText: 'Summary text',
        customText: 'Text',
        addItem: 'Add item',
        removeItem: 'Remove item',
        company: 'Company',
        role: 'Role',
        period: 'Period',
        location: 'Location',
        description: 'Description (one line per bullet)',
        institution: 'Institution',
        degree: 'Degree',
        skillGroup: 'Group (optional)',
        skillItems: 'Skills (comma separated)',
        language: 'Language',
        level: 'Level',
        periodPlaceholder: 'MM/YYYY – Present',
        boldHint: 'Tip: use **text** for bold.',
        topic: 'Topic',
        topicPlaceholder: 'Topic (optional)',
        rowText: 'Text',
        addRow: 'Add topic',
        removeRow: 'Remove topic',
        rowsHint:
          'Leave the topic empty to write free text. Use **text** for bold and start a line with - or • to create bullets.',
      },
      preview: { title: 'Preview', placeholderName: 'Your name' },
    },
  },
}

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY)
    if (saved === 'pt' || saved === 'en') return saved
  } catch {
    // localStorage indisponível
  }
  return navigator.language.toLowerCase().startsWith('pt') ? 'pt' : 'en'
}

export function setLang(lang: Lang) {
  void i18n.changeLanguage(lang)
  document.documentElement.lang = lang === 'pt' ? 'pt-BR' : 'en'
  try {
    localStorage.setItem(LANG_KEY, lang)
  } catch {
    // localStorage indisponível
  }
}

const lng = initialLang()
void i18n.use(initReactI18next).init({ resources, lng, fallbackLng: 'en', interpolation: { escapeValue: false } })
document.documentElement.lang = lng === 'pt' ? 'pt-BR' : 'en'

export default i18n
