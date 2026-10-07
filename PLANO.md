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
| Idiomas (pt-BR/en) | react-i18next | Interface bilíngue; o idioma da interface segue a aba de idioma ativa do currículo (seção 5.4) |
| Hospedagem | Cloudflare **Workers** (um só projeto: o site estático e a API em `/api/*`) | CDN global; já ligado ao repositório e ao domínio; o Worker é código sob demanda, sem servidor para cuidar |
| Backend | Supabase (Auth, Postgres, Storage, Edge Functions) | Já decidido |
| LLM | **Gemini 3.1 Flash-Lite** (API do Google AI Studio) por uma camada plugável, hoje num Worker da Cloudflare (Edge Function do Supabase quando houver login) | Chave de API nunca vai ao navegador; troca de provedor sem mexer no front (seção 6.4) |
| Conferência da introdução | **Jev** (TypeSafe), chamado pelo Worker | Mede se a sugestão inventa algo e se aborda a vaga (seção 6.6) |
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

**Situação atual (etapa 3, análise de vaga).** O login e o banco entram na fase 2 (seção 4.3); a análise continua num **Worker da Cloudflare**, no mesmo projeto e domínio do site, e não numa Edge Function. O desenho do diagrama acima continua valendo para quando o Supabase entrar; o código do LLM (`web/worker/`) é portável.
- `web/worker/index.ts`: roteia `/api/analyze` e `/api/translate` e entrega o site (arquivos estáticos, modo SPA) para o resto.
- `web/worker/analyze.ts`, `prompt.ts`, `llm.ts`: validação, prompt, chamada OpenAI-compatível e regras do servidor (evidência de habilidade precisa existir no currículo; a introdução volta num só idioma, o da aba ativa; uma nova tentativa se a resposta vier fora do formato).
- `web/worker/translate.ts`: tradução dos textos do currículo ao trocar de aba de idioma (seções 5.4 e 6.5). Usa os contadores do Durable Object em outra instância (`translate`), para traduzir não gastar as análises de vaga: 20 por hora por IP e 200 por dia (variáveis `TRANSLATE_PER_IP_HOUR` e `TRANSLATE_DAILY_CAP`).
- `web/worker/verify.ts`, `jev.ts`, `text.ts`: conferência da introdução sugerida com o Jev (seção 6.6).
- `web/worker/limiter.ts`: Durable Object (SQLite) com o limite por IP (20 por hora na fase de teste, IP guardado só como hash) e o teto diário total (200). Valores em `wrangler.jsonc` (`RATE_PER_IP_HOUR` e `DAILY_CAP`).
- Segurança: só aceita pedidos do próprio site (cabeçalho `Origin`); o texto da vaga é tratado como dado; o currículo enviado não leva nome, e-mail, telefone nem links.
- Segredos no painel da Cloudflare, tipo "Segredo": `LLM_API_KEY` (chave do Google AI Studio) e `TYPESAFE_API_KEY` (Jev). Variáveis em `wrangler.jsonc`: `LLM_BASE_URL` (`https://generativelanguage.googleapis.com/v1beta/openai/`), `LLM_MODEL` (`gemini-3.1-flash-lite`) e `LLM_REASONING_EFFORT` (`minimal`, o nível mais baixo de "pensamento" do Gemini 3.x). Se o provedor recusar o `reasoning_effort` (HTTP 400), o código repete a chamada sem ele. Os padrões do código (NVIDIA e `openai/gpt-oss-120b`) só valem se as variáveis faltarem.
- **Logs**: o Workers Logs está ligado (bloco `observability` do `wrangler.jsonc`). Cada chamada ao LLM registra o tempo, o modelo e os tokens de entrada, de saída e de raciocínio; falhas registram a causa (tempo esgotado, rede ou HTTP). Horários no painel aparecem em BRT.
- Em desenvolvimento (`npm run dev`), o Vite atende `/api/analyze` com o mesmo código, lendo `LLM_API_KEY` do `.env` local, sem limite de uso.

## 4. Modelo de dados

### 4.1 Formato do currículo (`content`, JSONB)

A **ordem dos blocos é a ordem do array** `sections`. Reordenar = mover item no array.

```ts
type Resume = {
  version: 1;
  header: { fullName: string; headline?: string; email?: string; phone?: string;
            location?: string; links?: { label: string; url: string }[] };
  sections: Section[];            // ordem = ordem no documento
  settings: { template: 'ats'; fontScale: number; fontSize: number };  // fontSize em pt, de 8 a 12 (padrão 10)
};

// Linha de conteúdo: tópico (opcional, em negrito) + texto. Sem tópico, vira texto livre.
type Row = { topic: string; text: string };

type Section =
  | { id: string; type: 'summary';    title: string; data: { rows: Row[] } }
  | { id: string; type: 'education';  title: string; data: { items: { institution: string; degree: string; period: string; rows: Row[] }[] } }
  | { id: string; type: 'experience'; title: string; data: { items: { company: string; role: string; period: string; location: string; rows: Row[] }[] } }
  | { id: string; type: 'skills';     title: string; data: { rows: Row[] } }
  | { id: string; type: 'languages';  title: string; data: { rows: Row[] } }
  | { id: string; type: 'custom';     title: string; data: { rows: Row[] } };
```

Todo bloco tem o **título** e uma lista de linhas **tópico + texto** (editor com adicionar/remover linha, como os links dos dados pessoais). No currículo, linha com tópico vira marcador com o tópico em negrito (`**Programação:** JavaScript, TypeScript…`); linha sem tópico vira texto livre. Em Experiência e Formação, cada item mantém cargo/curso, empresa/instituição e período, e a descrição é a lista de linhas.

Usar tipo por seção (em vez de um blob de HTML) permite renderizar, exportar e enviar ao LLM só o que interessa (ex.: só `summary` + `skills` + `experience`).

Dados salvos no formato antigo (texto único por bloco, `version` 1 do armazenamento local) são convertidos automaticamente para o formato de linhas na primeira abertura (`web/src/lib/migrate.ts`).

Blocos vindos da importação de PDF (seção 5.2) mantêm o tipo quando é Resumo, Habilidades ou Idiomas; Experiência, Formação e demais entram como `custom`. O texto é o original, sem alteração, já separado em linhas tópico + texto.

### 4.2 Tabelas (SQL, com RLS)

```sql
-- Implementada em supabase/migrations/20261006000000_resumes.sql (resumo):
create table public.resumes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  lang        text not null check (lang in ('pt', 'en')),
  content     jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, lang)       -- um currículo base por idioma (variantes por vaga: fase 6)
);

create table public.job_analyses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  resume_id   uuid not null references public.resumes(id) on delete cascade,
  job_title   text,
  job_text    text not null,
  result      jsonb not null,          -- saída validada do LLM (seção 6)
  provider    text not null,           -- ex.: 'google:gemini-3.1-flash-lite'
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

### 4.3 Login e sincronização (fase 2)
- **Decisões (06/10):** login por **e-mail e senha** (Google fica para depois); **login obrigatório** para usar o site; no banco fica **só o currículo base**, um por idioma (histórico de análises e variantes por vaga ficam para a fase 6).
- **Banco:** `supabase/migrations/20261006000000_resumes.sql` (tabela `resumes` com uma linha por usuário e idioma, RLS por usuário, gatilho `updated_at`). Roda-se uma vez no SQL Editor do Supabase.
- **Configuração pública:** `SUPABASE_URL` e `SUPABASE_ANON_KEY` ficam em `wrangler.jsonc` (a chave "anon" é pública por desenho; quem protege os dados é o RLS). O Worker as serve em `/api/config` e o site cria o cliente com elas. **Sem elas, o site abre sem login.** A chave `service_role`, a chave "secret" e a senha do banco nunca entram no site nem no repositório.
- **Entrada:** `AuthGate` mostra a tela de e-mail e senha. Ao entrar, o currículo da conta carrega antes de aparecer; conta sem currículo começa em branco, e o que havia no navegador é sempre descartado (a conta é a fonte da verdade e nenhum dado passa de uma conta para outra). Salva sozinho 1 s depois da última alteração e ao esconder a aba, e mostra "Salvando…/Salvo". Ao sair, grava o que estava pendente e limpa o currículo do navegador.
- **API protegida:** com o login configurado, `/api/analyze` e `/api/translate` exigem o token da sessão (o Worker confere com o Supabase em `/auth/v1/user`, só com a chave pública) e o limite de uso passa a ser **por usuário**, não por IP.

## 5. Funcionalidades do front-end

### 5.1 Editor com blocos arrastáveis
- Cada seção é um card com **alça de arrasto** (ícone ⋮⋮), título editável, botão recolher e menu (duplicar, remover).
- `SortableContext` com `verticalListSortingStrategy`; ao soltar, `arrayMove` no array `sections`.
- Alternativa por teclado (dnd-kit `KeyboardSensor`) e botões ↑/↓ no menu, para acessibilidade e mobile.
- Pré-visualização do documento ao lado, refletindo a nova ordem em tempo real.
- Autosave com *debounce* (~1 s) para `resumes.content`.

### 5.2 Criação do modelo base (3 caminhos)
1. **Manual**: começa com seções padrão vazias e o usuário preenche.
2. **Guia de perguntas (wizard)**: passos curtos (dados pessoais → objetivo → formação → experiências → habilidades → idiomas). Cada resposta preenche diretamente uma seção. Sem LLM. **Feito:** botão "Montar por perguntas" na barra superior; só entra o que foi preenchido, no idioma da aba ativa; habilidades e idiomas usam o formato `Grupo: item, item`; pede confirmação antes de substituir uma aba que já tem conteúdo.
3. **Importar PDF** (sem LLM, sem reescrever nada):
   - `pdfjs-dist` extrai o texto no navegador.
   - O código procura títulos de seção conhecidos em português e inglês ("Experiência", "Formação", "Habilidades", "Experience", "Education"…) e corta o texto em blocos. O conteúdo é copiado exatamente como está.
   - Dentro de cada bloco, a linha "Tópico: texto" (com ou sem marcador) vira uma linha tópico + texto. Regra: o tópico é o trecho antes do primeiro `:` quando tem até 8 palavras e 60 caracteres e o `:` é seguido de espaço. Linhas seguidas sem tópico viram uma única linha de texto livre. O Resumo não é separado em tópicos. Linhas quebradas no meio de uma frase são unidas.
   - Evolução possível: reconhecer o tópico pelo negrito do PDF (para tópicos sem dois-pontos) e separar cargo, empresa e período em Experiência.
   - A tela mostra: *"Este foi o texto que foi possível reconhecer. Se houver qualquer outro texto, adicione manualmente no editor."* O usuário confirma e segue para o editor.
   - O documento gerado sai no formato ATS (seção 8).
   - PDF escaneado (sem texto): avisar e oferecer o wizard ou o modo manual; OCR fica fora do escopo.

### 5.3 Adequação à vaga
Tela com caixa de texto da vaga → botão "Analisar" → resultado em duas abas. O idioma da introdução sugerida é **sempre o da aba de idioma ativa** (seção 5.4); não há escolha de idioma nesta tela e a IA não precisa descobrir o idioma. Se a vaga estiver em outro idioma que o da aba, não há aviso: o texto sai no idioma da aba.
- **Introdução sugerida**: um só texto. Mostra o original × sugerido com **diff destacado** (para evidenciar que a mudança é pontual) e botões *Aplicar* / *Desfazer*. Aplicar cria uma **variante** (`parent_id` = base), sem sobrescrever o base. O resultado só aparece na aba em que foi gerado.
- **Habilidades**: tabela (seção 6.2). Botão "Adicionar ao meu currículo" em cada habilidade faltante, para o caso de o usuário a possuir e não ter informado.

### 5.4 Abas de idioma
Nenhum texto fica em dois idiomas. O site tem duas abas no topo, **Português (BR)** e **English** (como no LinkedIn). Cada aba tem o seu currículo completo.
- A aba ativa define o idioma do currículo, da **interface** (menus e botões), da introdução sugerida e do **PDF exportado**.
- Ao clicar numa aba **nunca aberta** com a atual preenchida, aparece o aviso: "Você já tem parte do seu currículo preenchido em (idioma da aba atual). Deseja traduzir o que já foi preenchido para (idioma da outra aba)?". **Sim** traduz e monta a outra aba (`POST /api/translate`); **Não** abre a aba vazia, com os títulos padrão no idioma dela. Aba já aberta antes troca direto, sem perguntar.
- **Botão "Traduzir"** (ao lado das abas): traz o conteúdo da **outra** aba, traduzido, para a aba em que o usuário está (estou no português: pega o inglês e traz traduzido; e vice-versa). Substitui o conteúdo da aba atual, por isso pergunta antes, e fica desabilitado se a outra aba estiver vazia. Mantém as configurações da aba atual (tamanho da fonte). Complementa a pergunta que só aparece na primeira troca de aba. Traduz todos os textos: títulos de bloco, tópicos e respostas, cargos, períodos, locais, cursos, blocos extras e o nome dos links; o teste `tests/translation.test.ts` falha se um campo novo ficar de fora. Nome, e-mail, telefone, endereços, empresas e instituições não são traduzidos nem enviados.
- Importar PDF: antes de abrir o envio do arquivo, mostra um aviso (Cancelar / OK) dizendo que a aba selecionada precisa ser do mesmo idioma do currículo; escolher errado é problema do usuário.
- Dados no navegador (`localStorage`, versão 3): `lang` (aba ativa), `resume` (aba ativa) e `saved` (a outra aba). O currículo salvo no formato antigo vai para a aba do idioma que a interface estava usando. Isto é provisório: com login, cada usuário terá os currículos no seu banco (Supabase).
- "Limpar tudo" limpa só a aba ativa.
- **Barra superior:** as abas ficam à esquerda, com a legenda "Idioma do currículo a ser gerado:" ao lado, e os botões (Montar por perguntas, Importar PDF, Limpar tudo, Exportar PDF) à direita, pequenos e com ícone. A aba ativa "abre" para uma **faixa colorida** que corre sob a barra, como uma aba de navegador: português em verde com tracejado azul; English em azul, branco e vermelho. Em telas menores, logo e botões ficam em cima e as abas na linha de baixo, sempre encostadas na faixa.
- **Conta:** um avatar genérico redondo no canto direito abre o e-mail logado e o botão Sair; o estado "Salvando/Salvo" fica ao lado dele.

### 5.5 Prévia em páginas A4 e tamanho da fonte
- A prévia mostra **uma folha A4 por página**, com "Página N de M" e a contagem de páginas no título. O conteúdo é medido fora da tela com a largura real do A4 (174 mm) e cada folha mostra a sua janela; em colunas estreitas a folha é reduzida para caber, sem rolagem horizontal.
- A quebra imita a impressão: a página fecha antes do primeiro bloco que não cabe (parágrafo, item de lista) e título de bloco ou cargo não fica sozinho no fim da página. É uma **estimativa**: o navegador faz a paginação real ao gerar o PDF e pode diferir em uma linha perto da borda.
- Tamanho da fonte escolhido na prévia: 8, 9, 10, 11 ou 12 pt (padrão 10 pt), gravado em `settings.fontSize` e usado também no PDF.
- A impressão usa o documento corrido (sem as folhas da prévia), então o texto do PDF continua contínuo para os extratores de ATS.

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

A implementação inicial fala o formato OpenAI-compatível (`/v1/chat/completions`), usado pela maioria dos provedores de gpt-oss. A resposta é **sempre revalidada com Zod/JSON Schema** antes de ir ao cliente; se falhar, uma nova tentativa e, depois, erro claro.

### 6.2 Contrato de saída de `analyze-job`

```ts
type JobAnalysis = {
  job: { title?: string; company?: string; seniority?: string };
  summary: {
    original: string;
    suggested: string;                                  // um só texto, no idioma da aba ativa
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
- Idioma de saída: o da aba ativa (`language` no pedido). O currículo **inteiro** é exportado no idioma da aba (ver 6.5).
- O texto da vaga é **dado, não instrução** (mitigação de *prompt injection*): vai delimitado em tag própria e o *system prompt* diz para ignorar comandos dentro dela.
- Enviar ao LLM apenas o necessário (sem telefone/e-mail).

### 6.5 Tradução do currículo
- A tradução acontece uma única vez, quando o usuário responde **Sim** ao trocar de aba (seção 5.4); depois cada aba é editada à mão. Ao exportar, o currículo sai no idioma da aba ativa, sem tradução na hora.
- `POST /api/translate` recebe só a lista de textos traduzíveis (não o currículo estruturado) e devolve a lista na mesma ordem; o servidor recusa respostas com quantidade de itens diferente ou que esvaziem um texto que existia (uma nova tentativa, depois erro).
- **Termos técnicos em inglês não são traduzidos.** Exemplo correto: "Eu trabalho com LLM (Large Language Models)". Exemplo incorreto: "Eu trabalho com MLL (Modelos de Linguagem Larga)".
- O prompt de tradução traz essa regra explícita, com exemplos, e vale nos dois sentidos (siglas, nomes de tecnologias, ferramentas, frameworks, cargos consagrados em inglês e nomes próprios ficam como estão).
- Nomes próprios (empresas, instituições, produtos) e números e links não mudam. Nome, e-mail, telefone, links, empresas e instituições nem são enviados ao serviço de tradução.
- São traduzidos: cargo/título, local, títulos dos blocos, tópicos e textos, cargos, períodos (ex.: "Presente" ↔ "Present") e cursos.

### 6.4 Modelo escolhido
**Gemini 3.1 Flash-Lite** (id `gemini-3.1-flash-lite`), pela API do Google AI Studio no modo compatível com OpenAI: endereço `https://generativelanguage.googleapis.com/v1beta/openai/` e chave no cabeçalho `Authorization: Bearer`.
- **Por que mudou da Groq:** em 06/10 a Groq deixou de aceitar novas assinaturas, e o plano atual recusava pedidos por limite de tokens por minuto (HTTP 429 e 413). O código é o mesmo; só trocaram as variáveis e o segredo.
- **Por que o 3.1 e não o 2.5 nem o 3.5:** em 06/10 a chave recusou o `gemini-2.5-flash-lite` com HTTP 404 ("no longer available to new users"): o Google limita os modelos 2.5 a quem já os usou. O `gemini-3.5-flash-lite` existe, mas custa bem mais (US$ 0,30 por milhão de entrada e US$ 2,50 de saída). Escolha: `gemini-3.1-flash-lite` no plano gratuito.

- **Por que mudou:** o plano partia do gpt-oss-120b. Em produção, o endpoint gratuito de teste da NVIDIA gerava só de **15 a 40 tokens por segundo**: a análise levava de 11 a 93 s e uma tradução pequena, 16 s. Os logs mostraram que o tempo era quase todo espera pelo provedor (Worker, limite de uso e Jev somavam cerca de 0,6 s). Trocando só o provedor, com o mesmo modelo, a análise caiu para **1,2 a 1,8 s** e a tradução para **1,5 s**.
- **Custo (preços do Google consultados em outubro de 2026):** o plano gratuito não cobra. No plano pago, US$ 0,25 por milhão de tokens de entrada e US$ 1,50 por milhão de saída; com ~5.000 tokens de entrada e ~1.000 de saída por análise, cerca de **US$ 0,0028 por análise** (US$ 2,75 por 1.000), mais caro que o gpt-oss. Há plano gratuito, mas o Google usa o conteúdo do plano gratuito para melhorar os produtos dele; os limites por minuto e por dia aparecem em `aistudio.google.com/rate-limit`. Base de comparação anterior: `comparacao-llms-curriculo.md`.
- **Esforço de raciocínio:** `LLM_REASONING_EFFORT` (hoje `minimal`). Modelos que "pensam" gastam tokens antes de responder: menos esforço é mais rápido e gasta menos do limite por minuto. O Gemini 3.1 Flash-Lite aceita `minimal`, `low`, `medium` e `high`; se o modelo recusar o valor, o código repete a chamada sem ele.
- **Troca de provedor** = mudar `LLM_BASE_URL`, `LLM_MODEL` e o segredo `LLM_API_KEY`; nenhum código muda.
- **Desenvolvimento local:** `.env` com a chave (ver `web/.env.example`).
- Validar o modelo com ~15 pares reais currículo+vaga (pt e en), medindo: JSON válido, fatos inventados, evidências corretas, qualidade do texto. **Ainda não feito**; os testes até agora foram com poucos exemplos.

### 6.6 Conferência da introdução com o Jev
O LLM escreve a introdução sugerida e o **Jev** (TypeSafe) a confere antes de ela chegar à tela. Sem a chave `TYPESAFE_API_KEY`, a conferência é pulada e a análise funciona como antes.
- **Duas notas de 0 a 1**: *fidelidade* (sem informação falsa: nada que o currículo não sustente e nada exagerado) e *adequação* (quanto o texto aborda o que a vaga pede, usando só o que o currículo tem). Limite de aprovação: **0,80**.
- **Mudar muito o texto não conta contra.** Foi retirada a pergunta que comparava com o original, porque punia justamente a adaptação à vaga.
- **Checagens de código antes do Jev**: números e habilidades "não possui" que não existem no currículo reprovam o texto sem chamar o Jev.
- **Refação**: se o texto não passa nas duas notas, o LLM o refaz **no máximo 1 vez** (`MAX_REDOS`); sem aprovação, vale a tentativa de maior nota. Eram 3 refações, mas não subiam a nota e dobravam o tempo.
- **Tela**: selo "Conferida" (verde) ou "Melhor versão encontrada, abaixo do limite" (âmbar), com as duas notas. Se o Jev falhar, a análise segue com um aviso.
- **Medido em produção com gpt-oss-20b na Groq** (a medir de novo com o Gemini): análise completa em **1,2 a 1,8 s**, com fidelidade de 0,82 a 0,96 e adequação de 0,89 a 0,96, sem refações.
- **Em aberto:** calibrar o limite de 0,80 e as perguntas com ~15 pares reais; o Jev é do agente `JEV/<tarefa>` (seção 12).

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
- Fonte Arial (ou fonte web **estática**; nunca fonte variável). Corpo de **10 pt** por padrão (o usuário escolhe de 8 a 12 pt na prévia, seção 5.5), `line-height` 1,3. Nome 18 pt, títulos de seção 11,5 pt em negrito, `letter-spacing` de no máximo 0,05em.
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
| 2 | **Feito, ligado em produção (aguarda teste manual).** Supabase: projeto, migrations, Auth (e-mail e senha), salvar/carregar currículos com RLS | Dois usuários não veem dados um do outro |
| 3 | **Feito, em produção.** Adequação à vaga: Worker `/api/analyze`, provedor plugável (Gemini 3.1 Flash-Lite), conferência com o Jev, tela com diff + tabela, no idioma da aba ativa. Falta validar com ~15 pares reais | Saída validada; nada inventado nos testes |
| 4 | **Feito.** Wizard de perguntas ("Montar por perguntas") | Base criado só respondendo perguntas |
| 5 | **Feito.** Importar PDF (extração de texto e separação em blocos, sem LLM) | PDFs reais de teste separados em blocos, sem alterar texto |
| 5.1 | **Feito, em produção.** Abas de idioma pt-BR/en, um currículo por aba, tradução ao trocar de aba e aviso na importação de PDF (seção 5.4) | Trocar de aba muda currículo, interface, introdução sugerida e PDF |
| 5.2 | **Feito, em produção.** Prévia em páginas A4 com contagem de páginas e tamanho da fonte de 8 a 12 pt (seção 5.5) | A prévia mostra quantas páginas o PDF terá |
| 6 | Variantes por vaga, histórico de análises, limites de uso, planos gratuito/pago | — |
| 7 | App com Capacitor. **Só inicia com ordem explícita do dono do projeto**, depois de o site estar pronto e testado | Reaproveita schemas e camada de dados |

A fase 1 vem antes do Supabase porque valida o núcleo (blocos + export) sem depender de infraestrutura.

## 11. Decisões

**Tomadas**
- Idiomas: português e inglês (interface e currículo), por **abas de idioma** (seção 5.4). Um texto nunca fica em dois idiomas: não existe mais a opção de gerar a introdução nos dois idiomas, e a IA não precisa detectar o idioma.
- Idioma de saída do LLM: o da aba ativa. O PDF sai no idioma da aba. A tradução do currículo acontece ao trocar de aba, se o usuário aceitar, mantendo os termos técnicos em inglês sem traduzir (seção 6.5).
- Planos: gratuito e pago; a cota e a cobrança ficam para depois.
- App: Capacitor, somente após o web estar pronto e com ordem explícita.
- Hospedagem: Cloudflare **Workers** (site e API no mesmo projeto), domínio `currimaker.niuai.com.br`, repositório GitHub `curriculomaker`. A VPS Hetzner e o Swarm não entram no início.
- LLM: **Gemini 3.1 Flash-Lite** (Google AI Studio), com pensamento mínimo (`LLM_REASONING_EFFORT` = `minimal`), no plano gratuito (seção 6.4). A NVIDIA gratuita foi abandonada por ser lenta (15 a 40 tokens por segundo).
- Conferência da introdução com o Jev: mede só informação falsa e adequação à vaga; mudar muito o texto não é falha (seção 6.6).
- Template: um único, ATS-friendly.
- Importação de PDF: só reconhecimento de texto, sem LLM e sem reescrever; o que não for reconhecido o usuário adiciona à mão.

- Backend da análise de vaga: Worker da Cloudflare, com limite por IP (20 por hora na fase de teste, para não estourar num possível laço) e teto diário (200) por Durable Object; a tradução tem contadores próprios. Migrar para o Supabase quando houver login.
- Login e banco (06/10): e-mail e senha, login obrigatório, só o currículo base (seção 4.3). Em seguida: planos gratuito/pago e a limpeza de CI e testes.

**Em aberto**
0. Antes de abrir ao público: religar a confirmação de e-mail e configurar o envio de e-mails do Supabase; login com Google é um acréscimo futuro. O projeto Supabase (`zxjfojugzayjzygvvnhn`, região São Paulo) já existe e a migração já foi aplicada.
1. Limites e termos do Google AI Studio para uso comercial e em escala (plano gratuito x pago, uso do conteúdo para treino no plano gratuito). Histórico da Groq: Em 06/10, às 19:39 (GMT-3), o plano atual recusou pedidos com HTTP 429 (limite de pedidos/tokens por minuto) e HTTP 413 (pedido grande demais), porque o código pedia `max_tokens` de 6.000 e a Groq reserva esse valor no limite por minuto. O padrão caiu para 4.000 e o Worker espera e repete uma vez no 429. Confirmar o plano da chave do Gemini antes de abrir para usuários reais.
2. Validar a qualidade com cerca de 15 pares de currículo e vaga (pt e en): JSON válido, fatos inventados, evidências corretas, qualidade do texto.
3. Calibrar o limite de 0,80 e as perguntas do Jev com esses mesmos pares.
4. CI: hoje roda só lint e build; falta rodar os testes (`npm test`, 25 testes) e decidir o que mais entra.
5. A mensagem de espera da análise na tela ainda diz "até 1 minuto", o que deixou de ser verdade com um provedor rápido.

## 12. Fluxo de trabalho no Git
Vários agentes (sessões do Claude) trabalham no mesmo repositório, então o fluxo é o de equipes de software:
- **Um branch por tarefa**, curto, criado a partir da `origin/main` atualizada, com PR, CI e **apagado depois do merge** (o GitHub apaga sozinho). Nunca reutilizar um branch já mesclado.
- **Nomes:** `pilot/<tarefa>` para o Claude principal (ex.: `pilot/abas-de-idioma`) e `JEV/<tarefa>` para o agente que cuida da conferência com o Jev (ex.: `JEV/ajustar-fidelidade`).
- **Uma pasta de trabalho (worktree) por agente**, para um não sobrescrever os arquivos do outro: `curriculo-pilot` (Claude principal) e `curriculo-jev`.
- **`main` protegida** pelo ruleset `proteger-main`: só recebe código por PR, com o check `build` do CI passando (lint e build), sem push forçado e sem apagar o branch. A lista de exceções (bypass) está vazia. Merge por *squash*.
- **Cada agente só mexe nos próprios arquivos**; quando uma mudança atravessa os arquivos do outro, avisa antes e combina a divisão.
- **Cloudflare:** a `main` vai a produção pelo Workers Builds; cada branch ganha um preview (`wrangler preview`, o bloco `previews` do `wrangler.jsonc`). Segredos (chaves de API) ficam como tipo "Segredo" no painel, nunca em arquivo.