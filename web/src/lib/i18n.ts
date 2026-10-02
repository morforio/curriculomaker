import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

export type Lang = 'pt' | 'en'
const LANG_KEY = 'currimaker:lang'

const resources = {
  pt: {
    translation: {
      app: { name: 'CurriMaker' },
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
        confirmReplace: 'Isso substitui o currículo atual no editor. Continuar?',
        truncated: 'O PDF tem {{pages}} páginas; só as primeiras {{max}} foram lidas.',
        errType: 'Escolha um arquivo PDF.',
        errSize: 'O arquivo passa de 10 MB.',
        errNoText: 'Não foi possível ler texto neste PDF. Ele pode ser um documento escaneado (imagem). Preencha manualmente no editor.',
        errRead: 'Não foi possível ler este PDF. Ele pode estar protegido por senha ou corrompido.',
      },
      toolbar: { language: 'Idioma', exportPdf: 'Exportar PDF', reset: 'Limpar tudo', confirmReset: 'Apagar todo o currículo?' },
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
        confirmReplace: 'This replaces the current resume in the editor. Continue?',
        truncated: 'The PDF has {{pages}} pages; only the first {{max}} were read.',
        errType: 'Choose a PDF file.',
        errSize: 'The file is larger than 10 MB.',
        errNoText: 'No text could be read from this PDF. It may be a scanned document (image). Fill it in manually in the editor.',
        errRead: 'This PDF could not be read. It may be password-protected or corrupted.',
      },
      toolbar: { language: 'Language', exportPdf: 'Export PDF', reset: 'Clear all', confirmReset: 'Delete the whole resume?' },
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
