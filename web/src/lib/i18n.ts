import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

export type Lang = 'pt' | 'en'
const LANG_KEY = 'currimaker:lang'

const resources = {
  pt: {
    translation: {
      app: { name: 'CurriMaker' },
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
      },
      preview: { title: 'Pré-visualização', placeholderName: 'Seu nome' },
    },
  },
  en: {
    translation: {
      app: { name: 'CurriMaker' },
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
