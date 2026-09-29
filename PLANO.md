# Currículo Personalizador (CurriMaker) — Plano e Arquitetura

Endereço: `currimaker.niuai.com.br` · Repositório: GitHub `curriculomaker` (é a pasta do projeto).

## 1. Visão

Aplicação web (depois app) para criar um **currículo-base** e adaptá-lo a cada vaga, com três pilares:

1. **Criar o modelo base**: manualmente, por guia de perguntas ou importando um PDF existente.
2. **Blocos reordenáveis**: cada seção (Introdução, Formação, Experiência…) é um bloco arrastável na vertical.
3. **Adequação à vaga (LLM)**: o usuário cola a descrição da vaga e recebe (a) uma introdução ajustada de forma pontual e (b) uma tabela comparando habilidades exigidas × habilidades do usuário.

Supabase guarda autenticação e os currículos de cada usuário.

## 2. Stack

| Camada | Escolha | Motivo |
|---|---|---|
| Front-end | React + Vite + TypeScript | Ecossistema de DnD maduro; lógica reaproveitável no app (Capacitor) |
| Estilo | Tailwind CSS | Rapidez; fácil de manter o layout do currículo consistente |
| Drag-and-drop | `@dnd-kit/sortable` | Acessível (teclado), mobile/touch, lista vertical simples |
| Estado | Zustand (+ TanStack Query para dados do Supabase) | Leve; separa estado do editor de estado do servidor |
| Formulários/validação | React Hook Form + Zod | Zod também valida a saída do LLM |
| Idiomas (pt-BR/en) | react-i18next | Interface bilíngue; idioma do currículo é independente do idioma da interface |
| Hospedagem do front | Cloudflare Pages (estático) | Grátis, CDN global; já ligado ao repositório e ao domínio |
| Backend | Supabase (Auth, Postgres, Storage, Edge Functions) | Já decidido |
| LLM | **gpt-oss-120b** por uma camada plugável dentro de Edge Functions | Chave de API nunca vai ao navegador; troca de provedor sem mexer no front |
| Leitura de PDF | `pdfjs-dist` no navegador, só extração de texto (sem LLM) | Grátis, não inventa conteúdo, não sobe o arquivo para servidor |
| Exportar PDF | Impressão com CSS `@media print` na v1; `@react-pdf/renderer` se precisar de mais controle | Ver seção 8 (ATS) |

## 3. Arquitetura

```
┌────────────────────────── Navegador (React) ──────────────────────────┐
│  Editor de blocos ── Wizard de perguntas ── Import PDF ── Tela "Vaga" │
│        │ (Zustand)                │ pdf.js extrai texto      │        │
│        │                          │ e separa em blocos       │        │
└────────┼──────────────────────────┼──────────────────────────┼────────┘
         │ supabase-js (RLS)        │ (tudo local, sem LLM)    │ invoke()
         ▼                                                     ▼
┌──────────────── Supabase ───────────────────────────────────────────┐
│ Auth │ Postgres (resumes, job_analyses) │ Edge Function:            │
│                                          └ analyze-job              │
│                                                   │                 │
│                                          LLMProvider (interface)    │
│                                          └ OpenAICompatibleProvider │
│                                            (NVIDIA, Baseten, Groq…) │
└─────────────────────────────────────────────────────────────────────┘
```

Regras:
- O navegador **só** fala com o Supabase. Nunca com o provedor de LLM.
- Edge Functions validam o JWT do usuário, aplicam limite de uso e só então chamam o LLM.
- Provedor escolhido por variáveis de ambiente (`LLM_PROVIDER`, `LLM_BASE_URL`, `LLM_MODEL`) nos *secrets* da função. A chave de API fica só nos secrets (e num `.env` local que não vai para o Git).

## 4. Modelo de dados

### 4.1 Formato do currículo (`content`, JSONB)

A **ordem dos blocos é a ordem do array** `sections`. Reordenar = mover item no array.

```ts
type Resume = {
  version: 1;
  header: { fullName: string; headline?: string; email?: string; phone?: string;
            location?: string; links?: { label: string; url: string }[] };
  sections: Section[];            // ordem = ordem no documento
  settings: { template: 'ats'; fontScale: number };
};

type Section =
  | { id: string; type: 'summary';    title: string; data: { text: string } }
  | { id: string; type: 'education';  title: string; data: { items: Education[] } }
  | { id: string; type: 'experience'; title: string; data: { items: Experience[] } }
  | { id: string; type: 'skills';     title: string; data: { groups: { label?: string; items: string[] }[] } }
  | { id: string; type: 'languages';  title: string; data: { items: { name: string; level: string }[] } }
  | { id: string; type: 'custom';     title: string; data: { markdown: string } };
```

Usar tipo por seção (em vez de um blob de HTML) permite renderizar, exportar e enviar ao LLM só o que interessa (ex.: só `summary` + `skills` + `experience`).

Blocos vindos da importação de PDF (seção 5.2) são salvos como `custom` com o texto original sem alteração; o usuário pode reescrevê-los à mão no editor.

### 4.2 Tabelas (SQL, com RLS)

```sql
create table public.resumes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null default 'Meu currículo',
  is_base     boolean not null default false,
  parent_id   uuid references public.resumes(id) on delete set null, -- variante derivada do base
  content     jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index one_base_per_user on public.resumes(user_id) where is_base;

create table public.job_analyses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  resume_id   uuid not null references public.resumes(id) on delete cascade,
  job_title   text,
  job_text    text not null,
  result      jsonb not null,          -- saída validada do LLM (seção 6)
  provider    text not null,           -- ex.: 'nvidia:gpt-oss-120b'
  created_at  timestamptz not null default now()
);

alter table public.resumes      enable row level security;
alter table public.job_analyses enable row level security;

create policy "own resumes"  on public.resumes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own analyses" on public.job_analyses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

Também: gatilho `updated_at`, e tabela `llm_usage(user_id, day, calls)` para limite diário (a cota por plano, gratuito ou pago, será definida depois).

## 5. Funcionalidades do front-end

### 5.1 Editor com blocos arrastáveis
- Cada seção é um card com **alça de arrasto** (ícone ⋮⋮), título editável, botão recolher e menu (duplicar, remover).
- `SortableContext` com `verticalListSortingStrategy`; ao soltar, `arrayMove` no array `sections`.
- Alternativa por teclado (dnd-kit `KeyboardSensor`) e botões ↑/↓ no menu, para acessibilidade e mobile.
- Pré-visualização do documento ao lado, refletindo a nova ordem em tempo real.
- Autosave com *debounce* (~1 s) para `resumes.content`.

### 5.2 Criação do modelo base (3 caminhos)
1. **Manual**: começa com seções padrão vazias e o usuário preenche.
2. **Guia de perguntas (wizard)**: passos curtos (dados pessoais → objetivo → formação → experiências → habilidades → idiomas). Cada resposta preenche diretamente uma seção. Sem LLM.
3. **Importar PDF** (sem LLM, sem reescrever nada):
   - `pdfjs-dist` extrai o texto no navegador.
   - O código procura títulos de seção conhecidos em português e inglês ("Experiência", "Formação", "Habilidades", "Experience", "Education"…) e corta o texto em blocos. O conteúdo é copiado exatamente como está.
   - A tela mostra: *"Este foi o texto que foi possível reconhecer. Se houver qualquer outro texto, adicione manualmente no editor."* O usuário confirma e segue para o editor.
   - O documento gerado sai no formato ATS (seção 8).
   - PDF escaneado (sem texto): avisar e oferecer o wizard ou o modo manual; OCR fica fora do escopo.

### 5.3 Adequação à vaga
Tela com caixa de texto da vaga e **checkboxes de idioma de saída** (Português, Inglês ou ambos) → botão "Analisar" → resultado em duas abas:
- **Introdução sugerida**: mostra o texto original × sugerido com **diff destacado** (para evidenciar que a mudança é pontual) e botões *Aplicar* / *Descartar* / *Editar*. Se mais de um idioma foi marcado, uma versão por idioma. Aplicar cria uma **variante** (`parent_id` = base), sem sobrescrever o base.
- **Habilidades**: tabela (seção 6.2). Botão "Adicionar ao meu currículo" em cada habilidade faltante, para o caso de o usuário a possuir e não ter informado.

## 6. Camada de LLM

### 6.1 Interface plugável

```ts
// supabase/functions/_shared/llm/types.ts
export interface LLMProvider {
  generateJSON<T>(args: {
    system: string;
    user: string;
    schema: object;          // JSON Schema da resposta
    maxTokens?: number;
  }): Promise<{ data: T; usage: { input: number; output: number } }>;
}
// factory: getProvider(Deno.env.get('LLM_PROVIDER'))
```

A implementação inicial fala o formato OpenAI-compatível (`/v1/chat/completions`), usado pela maioria dos provedores do gpt-oss-120b. A resposta é **sempre revalidada com Zod/JSON Schema** antes de ir ao cliente; se falhar, uma nova tentativa e, depois, erro claro.

### 6.2 Contrato de saída de `analyze-job`

```ts
type JobAnalysis = {
  job: { title?: string; company?: string; seniority?: string };
  summary: {
    original: string;
    suggested: Partial<Record<'pt' | 'en', string>>;   // um texto por idioma marcado
    changes: { from: string; to: string; reason: string }[]; // alterações pontuais
  };
  skills: {
    name: string;                         // normalizada (ex.: "PostgreSQL")
    importance: 'required' | 'preferred';
    status: 'has' | 'partial' | 'missing';
    evidence?: string;                    // trecho do currículo que comprova (obrigatório se has/partial)
  }[];
  keywords: string[];                     // termos da vaga úteis para triagem por ATS
};
```

### 6.3 Regras do prompt (guardrails)
- **Não inventar**: a introdução só pode usar fatos presentes no currículo. Habilidade ausente **não** entra no texto; vai para a tabela como `missing`.
- **Alterações pontuais**: manter a estrutura e a voz do texto original; trocar/ordenar termos para refletir a linguagem da vaga. Limite de mudança (ex.: no máximo 2–3 trechos) e `changes[]` obrigatório.
- **Habilidade `has` exige `evidence`** vinda do currículo, com validação no servidor (a evidência deve existir como trecho do `content` enviado). Isso reduz falsos positivos.
- Idioma(s) de saída: os marcados pelo usuário. O currículo **inteiro** é exportado no idioma escolhido (ver 6.5).
- O texto da vaga é **dado, não instrução** (mitigação de *prompt injection*): vai delimitado em tag própria e o *system prompt* diz para ignorar comandos dentro dela.
- Enviar ao LLM apenas o necessário (sem telefone/e-mail).

### 6.5 Tradução do currículo
- Ao exportar, o currículo inteiro (não só a introdução) sai no idioma selecionado: português, inglês, ou os dois.
- **Termos técnicos em inglês não são traduzidos.** Exemplo correto: "Eu trabalho com LLM (Large Language Models)". Exemplo incorreto: "Eu trabalho com MLL (Modelos de Linguagem Larga)".
- O prompt de tradução traz essa regra explícita, com exemplos, e vale nos dois sentidos (siglas, nomes de tecnologias, ferramentas, frameworks, cargos consagrados em inglês e nomes próprios ficam como estão).
- Nomes próprios (empresas, instituições, produtos) e números, datas e links não mudam.
- Só o texto livre é traduzido; os títulos fixos dos blocos vêm da interface (i18n).

### 6.4 Modelo escolhido
**gpt-oss-120b.** Custo estimado com ~4.000 tokens de entrada e ~1.500 de saída por análise: cerca de US$ 1,15 por 1.000 análises (Baseten, US$ 0,10 por milhão de tokens de entrada e US$ 0,50 de saída). Base: `comparacao-llms-curriculo.md`.

- **Desenvolvimento**: API do NVIDIA Build (conta já criada, gratuita), sujeita aos termos e limites da conta.
- **Produção**: provedor a definir; conferir se os termos do NVIDIA Build permitem uso comercial.
- Validar o modelo com ~15 pares reais currículo+vaga (pt e en), medindo: JSON válido, fatos inventados, evidências corretas, qualidade do texto.

## 7. Segurança e custo
- **RLS** em todas as tabelas; nada de `service_role` no cliente.
- Política de privacidade e exclusão de conta que apaga tudo (`on delete cascade`).
- **Limites**: tamanho máximo do texto da vaga (~15 mil caracteres) e do PDF; cota diária de análises por usuário; CORS restrito ao domínio do app.
- **Segredos**: chaves só em `supabase secrets`; `.env` local fora do Git (`.gitignore` desde o primeiro commit).
- Sanitizar qualquer texto renderizado (nada de `dangerouslySetInnerHTML` sem sanitização).

## 8. Exportação e triagem por ATS

Um **template ATS-friendly** é um layout que os sistemas de triagem (Applicant Tracking System) leem sem errar. É o único template da v1. Ele une duas coisas: as regras de extração da pesquisa (seção 8.1) e o **visual do currículo do dono do projeto** (seção 8.2). O currículo precisa ser bonito também para quem o lê (recrutador humano, indicação), não só para a triagem.

Base: pesquisa de 29/09/2026 (docs oficiais de Gupy, Greenhouse, Workday e RChilli; testes de extração com xpdf, pypdf, pdfminer, PyMuPDF e pdf.js no PDF gerado pelo Edge/Chromium). Nenhum ATS real foi testado, e o efeito sobre contratação não tem evidência: só sobre extração de texto.

### 8.1 Regras de extração (ATS)

**Estrutura**
- Uma coluna. Sem tabelas, caixas de texto, ícones, barras ou estrelas de habilidade.
- O cabeçalho de contato é sempre o primeiro bloco e não é reordenável. Os demais blocos são reordenáveis, com cada título logo acima do seu conteúdo.
- Nomes de seção convencionais, sem título combinado:

| PT-BR | EN |
|---|---|
| Resumo Profissional | Professional Summary |
| Experiência Profissional | Work Experience |
| Formação Acadêmica | Education |
| Habilidades | Skills |
| Idiomas | Languages |
| Cursos, Certificações, Projetos, Voluntariado (um título por tipo) | Courses, Certifications, Projects, Volunteering |

**Tipografia e página**
- A4, margens de 15 mm (topo/base) e 18 mm (laterais).
- Fonte Arial (ou fonte web **estática**; nunca fonte variável). Corpo de **10 pt**, `line-height` 1,3. Nome 18 pt, títulos de seção 11,5 pt em negrito, `letter-spacing` de no máximo 0,05em.
- `font-variant-ligatures: none` (ligaturas quebram palavras como "financeiro" nos extratores).
- Bullets com `<ul>` nativo (`list-style: disc`). Nada de bullets via `content:` no CSS.
- Sem `position: fixed/absolute`. Sem alinhar datas à direita com flex, tab ou float.
- Texto sempre em cor escura e legível; nunca texto branco ou oculto.

**Impressão para PDF**
- `@page` com margem e as 6 caixas de margem vazias (`@top-*`, `@bottom-*`), para o cabeçalho e rodapé do navegador (data, título, URL) não vazarem para o texto do PDF. Manter a dica na interface: desativar "Cabeçalhos e rodapés".
- `document.title` = "Nome Sobrenome - Currículo" (vira o metadado do PDF e o nome sugerido do arquivo). `<html lang>` conforme o idioma.
- HTML semântico (`h1`, `h2`, `ul/li`): o Chrome gera o PDF com marcação de estrutura sem custo.

**Conteúdo**
- Datas: `MM/AAAA – MM/AAAA` e `MM/AAAA – Presente` (EN: `MM/YYYY – Present`), sempre com mês, no mesmo formato em todo o currículo. Data em linha própria ou inline logo após o cargo. Nunca repetir datas dentro da descrição.
- Cabeçalho de contato em texto, no corpo: e-mail, telefone, links e "Cidade, UF". Links com a **URL visível e clicável**.
- Não incluir: foto, CPF, RG, data de nascimento/idade, estado civil, filhos, endereço completo, pretensão salarial. (Opção futura: campo opcional quando a vaga exigir, ex.: CNH.)
- Habilidades em texto, agrupadas por rótulo (`Ferramentas: Excel, SQL`), de 10 a 20 itens. Idiomas em palavras (`Inglês - Avançado (C1)`).
- Bullets: de 3 a 6 por cargo, começando com verbo de ação, com números quando houver. Cargo por extenso e nome formal da empresa (Ltda., S.A.).
- Comprimento: 1 página até cerca de 5 anos de experiência; 2 páginas para sênior; evitar 3.
- Nome de arquivo sugerido: ASCII, sem espaços.
- Para o Brasil: escrever no idioma da vaga; a Gupy prefere DOCX quando possível, então exportar **DOCX** fica como evolução futura (exige biblioteca própria, não o PDF do navegador).

**Decisões de tecnologia**
- Gerar o PDF pelo navegador (impressão) é suficiente. `@react-pdf/renderer` não traz ganho de extração, hifeniza palavras em português por padrão, não gera marcação de estrutura e tem issues abertas de mapeamento de texto: fora de cogitação por ora.
- Geração no servidor (Puppeteer/Playwright) só se o diálogo de impressão virar problema. Não testado.

### 8.2 Visual (estilo do currículo do dono do projeto)

Só a estilização foi adotada do currículo de exemplo. O tamanho de letra segue a pesquisa (10 pt), e a quantidade de páginas é problema do conteúdo.

| Elemento | Estilo |
|---|---|
| Fonte | Helvetica/Arial |
| Texto | `#333333` |
| Cor de destaque (azul) | `#1F4E79`: nome, títulos de seção e cargo/empresa |
| Texto secundário (local, subtítulo) | `#555555`, em itálico |
| Nome | Maiúsculas, centralizado, negrito, azul, com filete azul de 1,5 pt embaixo |
| Contato | Caixa com fundo `#F2F7FA` e borda `#D3E1EC`, texto centralizado, rótulos em negrito (E-mail, Telefone, Localização, LinkedIn, GitHub) |
| Títulos de seção | Maiúsculas, negrito, azul, com filete azul de 0,75 pt embaixo |
| Cargo + empresa | Negrito azul; período em itálico após um `|`, na mesma linha |
| Termos-chave no texto | Negrito, digitando `**texto**` no editor |
| Bullets | Disco simples, recuo de 13 pt |

Cor, fundo e filetes são só CSS (forma), sem efeito na camada de texto do PDF. As cores precisam sair na impressão (`print-color-adjust: exact`).

### 8.3 Protocolo de teste do PDF
Testar com dados **fictícios** realistas. Ferramentas: `pdftotext` (xpdf/poppler), pypdf, pdfminer.six, PyMuPDF e pdf.js. Critérios de aprovação:
- 100% do texto de referência presente após normalização NFKC nos 5 extratores (e em pelo menos 4 de 5 sem normalizar).
- Zero caractere de substituição (U+FFFD) ou de uso privado (U+E000–F8FF); zero ligaturas (U+FB00–FB06).
- Zero título com letras espaçadas ("R E S U M O").
- A ordem dos títulos extraída é igual à ordem escolhida pelo usuário.
- Nome e e-mail nas 3 primeiras linhas; toda data a até 3 linhas do seu cargo.
- Toda URL visível no texto e clicável (anotação de link).
- Nenhuma string do navegador (`file:///`, `localhost`, data/hora, "1/1").
- Todas as fontes embutidas e nenhuma do tipo Type3; título e idioma do PDF preenchidos.
- Menos de 1 MB; no máximo 2 páginas.
- Teste manual: selecionar tudo no visualizador e colar no Bloco de Notas; o texto deve estar legível e na ordem.

Lacunas conhecidas: não validado o diálogo de impressão do Chrome (a pesquisa usou o Edge em modo headless), nem Firefox e Safari; WOFF2 de fonte web remota não testado; `hyphens: auto` inconclusivo; nenhum ATS real testado.

## 9. Estrutura de pastas proposta

A raiz é o repositório `curriculomaker`.

```
curriculomaker/
├─ PLANO.md
├─ comparacao-llms-curriculo.md
├─ web/                          # app React (Vite)
│  ├─ src/
│  │  ├─ features/
│  │  │  ├─ editor/              # blocos, dnd, preview
│  │  │  ├─ wizard/              # guia de perguntas
│  │  │  ├─ import-pdf/          # extração de texto + separação em blocos
│  │  │  ├─ job-match/           # tela da vaga, diff, tabela de skills
│  │  │  └─ auth/
│  │  ├─ lib/ (supabase.ts, schemas/ (zod), pdf.ts)
│  │  └─ store/
│  └─ .env.example
└─ supabase/
   ├─ migrations/                # SQL da seção 4.2
   └─ functions/
      ├─ _shared/llm/            # interface + provedor
      └─ analyze-job/
```

## 10. Roadmap

| Fase | Entrega | Critério de pronto |
|---|---|---|
| 0 | Repositório, Vite + TS + Tailwind, lint, `.gitignore`, `.env.example` | App sobe em branco |
| 1 | Schemas Zod do currículo + editor manual com blocos arrastáveis + preview + export PDF ATS (dados em `localStorage`) + i18n pt/en | Reordenar blocos muda o PDF |
| 2 | Supabase: projeto, migrations, Auth, salvar/carregar currículos com RLS | Dois usuários não veem dados um do outro |
| 3 | Adequação à vaga: `analyze-job`, provedor plugável, tela com diff + tabela + checkbox de idioma | Saída validada; nada inventado nos testes |
| 4 | Wizard de perguntas | Base criado só respondendo perguntas |
| 5 | Importar PDF (extração de texto e separação em blocos, sem LLM) | PDFs reais de teste separados em blocos, sem alterar texto |
| 6 | Variantes por vaga, histórico de análises, limites de uso, planos gratuito/pago | — |
| 7 | App com Capacitor. **Só inicia com ordem explícita do dono do projeto**, depois de o site estar pronto e testado | Reaproveita schemas e camada de dados |

A fase 1 vem antes do Supabase porque valida o núcleo (blocos + export) sem depender de infraestrutura.

## 11. Decisões

**Tomadas**
- Idiomas: português e inglês (interface e currículo).
- Idioma de saída do LLM: o usuário escolhe por checkbox (português, inglês ou ambos). O currículo inteiro é exportado traduzido para o idioma escolhido, mantendo os termos técnicos em inglês sem traduzir (seção 6.5).
- Planos: gratuito e pago; a cota e a cobrança ficam para depois.
- App: Capacitor, somente após o web estar pronto e com ordem explícita.
- Hospedagem: Cloudflare Pages, domínio `currimaker.niuai.com.br`, repositório GitHub `curriculomaker`. A VPS Hetzner e o Swarm não entram no início.
- LLM: gpt-oss-120b; NVIDIA Build no desenvolvimento.
- Template: um único, ATS-friendly.
- Importação de PDF: só reconhecimento de texto, sem LLM e sem reescrever; o que não for reconhecido o usuário adiciona à mão.

**Em aberto**
1. Provedor do gpt-oss-120b em produção e termos de uso comercial do NVIDIA Build.
