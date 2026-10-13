# Currículo Personalizador (CurriMaker) — Plano e Arquitetura

Endereço: `currimaker.niuai.com.br` · Repositório: GitHub `curriculomaker` (é a pasta do projeto).

## 1. Visão

Aplicação web (depois app) para criar um **currículo-base** e adaptá-lo a cada vaga, com três pilares:

1. **Criar o modelo base**: manualmente, por guia de perguntas ou importando um PDF existente.
2. **Blocos reordenáveis**: cada seção (Introdução, Formação, Experiência…) é um bloco arrastável na vertical.
3. **Adequação à vaga (LLM)**: o usuário cola a descrição da vaga e recebe (a) uma introdução ajustada de forma pontual e (b) uma tabela comparando habilidades exigidas × habilidades do usuário.

Supabase guarda autenticação, os currículos e o saldo de créditos de cada usuário. O uso da IA, da tradução e da exportação em PDF gasta **créditos**: a conta gratuita ganha alguns por mês e o **plano pro** (assinatura mensal paga pelo Asaas) traz mais (seção 4.4).

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
| LLM | **gpt-oss-20b pela OpenRouter**, com o **gpt-oss-120b** de modelo reserva, por uma camada plugável num Worker da Cloudflare | Chave de API nunca vai ao navegador; troca de provedor sem mexer no front (seção 6.4) |
| Conferência da introdução | **Jev** (TypeSafe), chamado pelo Worker | Mede se a sugestão inventa algo e se aborda a vaga (seção 6.6) |
| Pagamento | **Asaas** (assinatura mensal: cartão, Pix ou boleto na página do próprio Asaas) | O cartão nunca passa pelo nosso servidor; o CPF não é guardado (seção 4.5) |
| Captcha e e-mail | Turnstile (Cloudflare) no login; Resend como SMTP do Supabase | Barra robôs no cadastro; e-mails de confirmação e de nova senha |
| Testes e CI | `node --test` (140 testes), oxlint, `tsc -b`, GitHub Actions | Roda a cada PR (seção 12) |
| Leitura de PDF | `pdfjs-dist` no navegador, só extração de texto (sem LLM) | Grátis, não inventa conteúdo, não sobe o arquivo para servidor |
| Exportar PDF | Impressão com CSS `@media print` na v1; `@react-pdf/renderer` se precisar de mais controle | Ver seção 8 (ATS) |

## 3. Arquitetura

```
┌────────────────────────── Navegador (React) ──────────────────────────┐
│  Editor de blocos ── Import PDF ── Tela "Vaga" ── Planos ── Termos    │
│        │ (Zustand)         │ pdf.js extrai texto        │              │
└────────┼───────────────────┼────────────────────────────┼──────────────┘
         │ supabase-js (RLS) │ (tudo local, sem LLM)      │ /api/*
         ▼                                                ▼
┌─── Supabase ────────────────────┐        ┌─── Worker da Cloudflare ────────────────┐
│ Auth (e-mail+senha, captcha)    │◄───────┤ confere o login (token do usuário)      │
│ Postgres, com RLS:              │ chave  │ cobra o crédito (spend_credit)          │
│  resumes, credit_accounts,      │service │ chama o LLM (OpenRouter) e o Jev        │
│  billing_customers,             │ _role  │ cria a assinatura no Asaas              │
│  credit_payments                │        │ recebe o aviso de pagamento (webhook)   │
└─────────────────────────────────┘        └───────┬─────────────────────────────────┘
                                                   ▼
                                  OpenRouter (LLM) · Jev (TypeSafe) · Asaas (pagamento)
```

Regras:
- O navegador fala com o **Supabase** (login e currículos, protegidos por RLS) e com o **Worker** (`/api/*`). Nunca com o provedor de LLM, com o Jev nem com o Asaas.
- O Worker valida o login do usuário, cobra o crédito no banco e só então chama o LLM. A chave `service_role` do Supabase só existe no Worker.
- Provedor do LLM escolhido por variáveis do Worker (`LLM_BASE_URL`, `LLM_MODEL`, `LLM_FALLBACK_MODEL`). A chave de API fica só nos *secrets* da Cloudflare (e num `.env` local que não vai para o Git).
- A API **falha fechada**: sem login configurado, sem chave do banco de créditos ou com o banco fora do ar, ela recusa em vez de liberar.

**Situação atual.** Tudo roda num **Worker da Cloudflare**, no mesmo projeto e domínio do site (`web/worker/`). Só os caminhos `/api/*` passam pelo Worker; o resto é o site estático (modo SPA: `/planos`, `/termos` e `/privacidade` devolvem o mesmo `index.html`).
- `index.ts`: roteador. Rotas: `/api/config`, `/api/seller`, `/api/analyze`, `/api/translate`, `/api/export`, `/api/checkout`, `/api/billing/cancel` e `/api/payment/webhook`.
- `analyze.ts`, `prompt.ts`, `llm.ts`: validação, prompt, chamada OpenAI-compatível e regras do servidor (evidência de habilidade precisa existir no currículo; a introdução volta num só idioma, o da aba ativa; uma nova tentativa se a resposta vier fora do formato). O `llm.ts` usa o modelo reserva quando o principal recusa por excesso de demanda ou não responde, e volta ao principal depois de 60 s.
- `translate.ts`: tradução dos textos do currículo (seções 5.4 e 6.5), com contadores próprios do Durable Object (instância `translate`): 20 por hora por usuário e 200 por dia (`TRANSLATE_PER_IP_HOUR`, `TRANSLATE_DAILY_CAP`).
- `verify.ts`, `jev.ts`, `text.ts`: conferência da introdução sugerida com o Jev (seção 6.6).
- `limiter.ts`: Durable Object (SQLite) com o limite de uso por usuário (20 por hora e teto diário total de 200, `RATE_PER_IP_HOUR` e `DAILY_CAP`; a chave é guardada só como hash) e o limite de 5 tentativas de pagamento por hora por usuário.
- `auth.ts`: confere o token da sessão no Supabase (`/auth/v1/user`, só com a chave pública).
- `credits.ts`: cobra e devolve créditos pelas funções SQL do banco (seção 4.4). `billing.ts`: assinatura, cancelamento e aviso de pagamento do Asaas (seção 4.5).
- `security.ts` e `public/_headers`: cabeçalhos de segurança (HSTS, CSP sem `unsafe-inline` em scripts, `frame-ancestors 'none'` etc.). O site estático recebe os cabeçalhos do `_headers`, a API recebe os do Worker; o teste `tests/security.test.ts` confere que os dois são iguais.
- Segredos no painel da Cloudflare, tipo "Segredo": `LLM_API_KEY` (OpenRouter), `TYPESAFE_API_KEY` (Jev), `SUPABASE_SERVICE_KEY` (créditos e pagamento), `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN` e os dados do vendedor `SELLER_NAME`, `SELLER_CPF`, `SELLER_ADDRESS` e `SELLER_EMAIL` (seção 4.6). Variáveis públicas em `wrangler.jsonc`: `LLM_BASE_URL` (`https://openrouter.ai/api/v1`), `LLM_MODEL` (`openai/gpt-oss-20b`), `LLM_FALLBACK_MODEL` (`openai/gpt-oss-120b`), `LLM_REASONING_EFFORT` (`low`), `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `TURNSTILE_SITE_KEY` (as três são públicas por desenho). Os padrões do código (NVIDIA e `openai/gpt-oss-120b`) só valem se as variáveis faltarem.
- **Logs**: o Workers Logs está ligado (bloco `observability` do `wrangler.jsonc`). Cada chamada ao LLM registra o tempo, o modelo e os tokens; falhas registram a causa. Horários no painel aparecem em BRT.
- Em desenvolvimento (`npm run dev`), o Vite atende a API com o mesmo código, lendo as chaves do `.env` local.

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
-- Só `resumes` foi implementada (supabase/migrations/20261006000000_resumes.sql, resumo abaixo).
-- `job_analyses` continua só no plano (fase 6: histórico de análises). Os créditos e o pagamento estão nas seções 4.4 e 4.5.
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

Também: gatilho `updated_at`. O limite de uso por plano não usa mais a tabela `llm_usage` do plano antigo: é o sistema de créditos da seção 4.4.

### 4.3 Login e sincronização (fase 2)
- **Decisões (06/10):** login por **e-mail e senha** (Google fica para depois); **login obrigatório** para usar o site; no banco fica **só o currículo base**, um por idioma (histórico de análises e variantes por vaga ficam para a fase 6).
- **Cadastro:** a confirmação de e-mail está ligada e o captcha **Turnstile** protege o login e o cadastro (chave do site no `wrangler.jsonc`; a chave secreta fica só no painel do Supabase). Os e-mails saem pelo SMTP do Supabase com o **Resend**. Os modelos de e-mail do Supabase ainda estão no texto padrão, em inglês.
- **Esqueci minha senha:** link na tela de entrada; pede o e-mail e o captcha e manda o link de nova senha. A resposta é sempre a mesma, exista ou não a conta (não revela quem tem cadastro). O link abre a tela "Nova senha" (`ResetPasswordScreen`); link vencido mostra o erro e volta ao login.
- **Banco:** `supabase/migrations/20261006000000_resumes.sql` (tabela `resumes` com uma linha por usuário e idioma, RLS por usuário, gatilho `updated_at`). Roda-se uma vez no SQL Editor do Supabase.
- **Configuração pública:** `SUPABASE_URL` e `SUPABASE_ANON_KEY` ficam em `wrangler.jsonc` (a chave "anon" é pública por desenho; quem protege os dados é o RLS). O Worker as serve em `/api/config` e o site cria o cliente com elas. **Sem elas, o site abre sem login.** A chave `service_role`, a chave "secret" e a senha do banco nunca entram no site nem no repositório.
- **Entrada:** `AuthGate` mostra a tela de e-mail e senha. Ao entrar, o currículo da conta carrega antes de aparecer; conta sem currículo começa em branco, e o que havia no navegador é sempre descartado (a conta é a fonte da verdade e nenhum dado passa de uma conta para outra). Salva sozinho 1 s depois da última alteração e ao esconder a aba, e mostra "Salvando…/Salvo". Ao sair, grava o que estava pendente e limpa o currículo do navegador.
- **API protegida:** com o login configurado, `/api/analyze`, `/api/translate`, `/api/export`, `/api/checkout` e `/api/billing/cancel` exigem o token da sessão (o Worker confere com o Supabase em `/auth/v1/user`, só com a chave pública) e o limite de uso passa a ser **por usuário**, não por IP.

### 4.4 Créditos e planos
Valores em `web/src/lib/plans.ts` (usados pelo site e pelo Worker, para nunca divergirem). Banco: `supabase/migrations/20261008000000_credits.sql`, tabela `credit_accounts` fechada ao público (RLS sem política): só o Worker, com a `service_role`, mexe no saldo, pelas funções SQL `spend_credit` e `refund_credit`; o site só lê o próprio saldo por `get_my_account()`.

| | Gratuito | Pro |
|---|---|---|
| Preço | R$ 0 | **R$ 39,90 por mês** (`PRO_PRICE_BRL`) |
| Créditos | **5**, válidos por **30 dias** (`FREE_CREDITS`, `FREE_DAYS`) | **60** por pagamento (`PRO_CREDITS`); substituem o saldo, não somam |
| Acesso | enquanto houver crédito válido | **31 dias** por pagamento (`PRO_ACCESS_DAYS`; o dia a mais dá folga para o pagamento seguinte) |
| Análise com IA e tradução | 1 crédito cada | 1 crédito cada |
| Exportar PDF | 1 crédito | **não gasta crédito** |

- **Conta travada** = não paga e sem crédito válido. A API devolve 402 (`no_credits`). Se o serviço falhar (IA fora do ar etc.), o crédito é **devolvido** (`refund_credit`).
- **No site** (`features/credits/`): o contador de créditos fica em cima do avatar; o aviso da conta travada (3 linhas, com link "plano pro" para `/planos`) aparece no editor. Com a conta travada ficam bloqueados: reordenar ou apagar blocos, adicionar bloco, importar PDF, trocar de aba de idioma, Traduzir, a análise com IA e o Exportar. Seguem livres: editar texto, adicionar e remover linhas, tamanho da fonte e "Limpar tudo".
- **Exportar e Ctrl+P:** o botão Exportar chama `/api/export` e só imprime se a resposta for 200 (gasta 1 crédito no plano gratuito). O Ctrl+P e o menu Imprimir do navegador seguem a mesma regra: na conta paga imprimem; na gratuita cobram 1 crédito; com a conta travada ou o estado desconhecido, a página sai **borrada** (`html.print-blur`), e o PDF não tem texto extraível (verificado com Edge e pdf.js: 0 caracteres).
- **Botão "Planos"** dourado, sempre à vista sob o "Salvo" e o avatar (some na própria página de planos).

### 4.5 Pagamento (Asaas)
Banco: `supabase/migrations/20261012000000_billing.sql` (tabelas `billing_customers` e `credit_payments`, também fechadas ao público, e as funções `grant_paid_plan`, `revoke_paid_plan`, `billing_*`). Código: `web/worker/billing.ts`, `web/src/features/billing/` (`PlansPage.tsx`, `api.ts`).
- **Página `/planos`** só em português (os usuários são brasileiros). Pede nome e CPF, exige marcar "Li e concordo com os Termos de uso (incluindo o reembolso em até 7 dias) e a Política de privacidade" e leva o cliente à página de pagamento do Asaas. O card do Pro tem borda dourada e o selo "Melhor custo-benefício".
- **Fluxo:** `/api/checkout` cria o cliente no Asaas (nome, CPF, `externalReference` = id do usuário) e uma assinatura mensal (`billingType: UNDEFINED`, o cliente escolhe cartão, Pix ou boleto lá) e devolve o link da primeira cobrança. Limite de 5 tentativas por hora por usuário. `/api/billing/cancel` cancela a assinatura.
- **Aviso de pagamento** (`/api/payment/webhook`, versão v3 da API, envio sequencial): autenticado pelo cabeçalho `asaas-access-token` (comparação em tempo constante com `ASAAS_WEBHOOK_TOKEN`). `PAYMENT_CONFIRMED` ou `PAYMENT_RECEIVED` liberam o plano **uma vez por id de pagamento** (idempotente); `PAYMENT_REFUNDED` e `CHARGEBACK_REQUESTED` revogam o plano, a não ser que exista um pagamento mais novo válido.
- **Ambiente escolhido pela chave:** chave de teste (`$aact_hmlg_...`) usa a conta de teste (sandbox, `api-sandbox.asaas.com`); chave de produção (`$aact_prod_...`) usa a conta real (`api.asaas.com`). Validado na conta de teste (23 testes com Asaas simulado, 10 cenários de SQL e teste manual ponta a ponta).
- **Dados sensíveis:** o **CPF não é guardado** por nós (vai direto ao Asaas) e o **cartão nunca passa** pelo nosso servidor.
- **Pix Automático** exige conta de pessoa jurídica (CNPJ com 6 meses ou mais); como pessoa física não existe. A cobrança recorrente funciona com os boletos/Pix/cartão da assinatura normal. Alternativa pesquisada: **Appmax** (taxas menores), adiada.
- **Responsabilidade:** o Asaas mostra ao pagador o nome e o CPF do vendedor (você). Os termos do Asaas tratam o vendedor como responsável pelo serviço, permitem reter valores por até 120 dias em disputa e bloquear a conta por suspeita ou chargeback acima de 1%. Por isso a política de reembolso (seção 4.6) é clara e o atendimento precisa responder rápido.

### 4.6 Termos de uso, privacidade e reembolso
Páginas `/termos` e `/privacidade` (`web/src/legal/`), **abertas sem login** e só em português, com link na tela de entrada e na página de planos; criar conta e assinar exigem concordância. Os textos usam as mesmas constantes de `plans.ts`, então preço, créditos e prazos não desatualizam sozinhos.
- **Dados do fornecedor** (nome, CPF, endereço e e-mail, exigidos pelo Decreto 7.962/2013) **não ficam no código**: o repositório é público. Vêm dos segredos `SELLER_NAME`, `SELLER_CPF`, `SELLER_ADDRESS` e `SELLER_EMAIL` da Cloudflare (tipo "Segredo", que não é apagado a cada deploy, ao contrário das variáveis comuns). O Worker os serve na rota pública `/api/seller` (`worker/seller.ts`) e a página monta o texto com eles (`src/legal/useSeller.ts`, `buildTerms` e `buildPrivacy`). Se faltar algum campo ou o CPF for inválido, a rota responde 503 e a página mostra "não foi possível carregar este texto", em vez de publicar um texto legal incompleto. Para mudar o endereço, é só trocar o segredo na Cloudflare. O teste `tests/legal.test.ts` valida as regras com dados fictícios.
- **Compromissos assumidos:** reembolso integral em até 7 dias corridos (art. 49 do CDC), pago em até 10 dias úteis; reembolso proporcional se o serviço falhar por culpa nossa; devolução proporcional se encerrarmos a conta do cliente; aviso de 30 dias para mudanças relevantes; limite de responsabilidade igual ao valor pago nos últimos 12 meses; exclusão de conta e dados a pedido, por e-mail.
- **Prestadores citados na política:** Supabase, Cloudflare, OpenRouter, TypeSafe (Jev), Resend e Asaas.
- São um modelo, não aconselhamento jurídico. Reembolsos são feitos **à mão** pelo painel do Asaas (o aviso `PAYMENT_REFUNDED` revoga o plano sozinho).

## 5. Funcionalidades do front-end

### 5.1 Editor com blocos arrastáveis
- Cada seção é um card com **alça de arrasto** (ícone ⋮⋮), título editável, botão recolher e menu (duplicar, remover).
- `SortableContext` com `verticalListSortingStrategy`; ao soltar, `arrayMove` no array `sections`.
- Alternativa por teclado (dnd-kit `KeyboardSensor`) e botões ↑/↓ no menu, para acessibilidade e mobile.
- Pré-visualização do documento ao lado, refletindo a nova ordem em tempo real.
- Autosave com *debounce* (~1 s) para `resumes.content`.

### 5.2 Criação do modelo base (3 caminhos)
1. **Manual**: começa com seções padrão vazias e o usuário preenche. As linhas de cada bloco são arrastáveis para reordenar.
2. **Guia de perguntas (wizard)**: **removido** (PR #30). O botão "Montar por perguntas" saiu da barra superior e as dicas de preenchimento foram para dentro dos blocos do editor (`GuidedRows`, `LabeledRows`). O formato `Grupo: item, item` de habilidades e idiomas continua.
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
- **Introdução sugerida**: um texto em tópicos curtos (cada tópico vira uma linha do bloco ao aplicar). Mostra o original × sugerido com **diff destacado** (para evidenciar que a mudança é pontual) e botões *Aplicar* / *Desfazer*. Em cima do texto vai a **nota de fidelidade**: selo verde "Conferida" quando passa, ou aviso âmbar de possível informação falsa quando não passa. Aplicar cria uma **variante** (`parent_id` = base), sem sobrescrever o base (variantes por vaga ainda não existem: hoje aplicar substitui a introdução da aba). O resultado só aparece na aba em que foi gerado.
- **Adequação à vaga** aparece como porcentagem (0 a 100%), neutra, **acima da tabela de habilidades** ("Adequação à vaga: N%"); não gera aviso nem decide se a resposta é boa (seção 6.6).
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
- **Conta:** no canto direito, o "Salvo/Salvando…" e um avatar genérico redondo (o menu mostra o e-mail logado e o botão Sair), com o **contador de créditos** em cima e o botão dourado **Planos** embaixo (seção 4.4).

### 5.5 Prévia em páginas A4 e tamanho da fonte
- A prévia mostra **uma folha A4 por página**, com "Página N de M" e a contagem de páginas no título. O conteúdo é medido fora da tela com a largura real do A4 (174 mm) e cada folha mostra a sua janela; em colunas estreitas a folha é reduzida para caber, sem rolagem horizontal.
- A quebra imita a impressão: a página fecha antes do primeiro bloco que não cabe (parágrafo, item de lista) e título de bloco ou cargo não fica sozinho no fim da página. É uma **estimativa**: o navegador faz a paginação real ao gerar o PDF e pode diferir em uma linha perto da borda.
- Tamanho da fonte escolhido na prévia: 8, 9, 10, 11 ou 12 pt (padrão 10 pt), gravado em `settings.fontSize` e usado também no PDF.
- A impressão usa o documento corrido (sem as folhas da prévia), então o texto do PDF continua contínuo para os extratores de ATS.

### 5.6 Visual do site
Tema escuro com fundo de constelação e blocos flutuantes sutis (`features/motion/`), com botão para reduzir o movimento. A interface (menus, botões) é bilíngue e segue a aba de idioma; as telas de planos, termos e privacidade são só em português. O título da aba é "CurriMaker" (e "CurriMaker - Nome" com o currículo aberto).

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
- `POST /api/translate` recebe só a lista de textos traduzíveis (não o currículo estruturado) e devolve a lista na mesma ordem. Por dentro, cada texto vai ao modelo com um **id**, em pedaços de até 20 textos feitos em paralelo; a resposta é casada pelo id, então sobra ou ordem trocada não atrapalha (em 06/10 o modelo devolveu 59 itens para 51 enviados, e a contagem exata derrubava a tradução). Só o que faltou ou voltou vazio é pedido de novo, uma vez; na primeira tentativa a tradução também precisa manter o número de linhas do original, para não aceitar conteúdo no id errado. Se ainda faltar algo, o erro é claro e nada parcial é aplicado.
- **Termos técnicos em inglês não são traduzidos.** Exemplo correto: "Eu trabalho com LLM (Large Language Models)". Exemplo incorreto: "Eu trabalho com MLL (Modelos de Linguagem Larga)".
- O prompt de tradução traz essa regra explícita, com exemplos, e vale nos dois sentidos (siglas, nomes de tecnologias, ferramentas, frameworks, cargos consagrados em inglês e nomes próprios ficam como estão).
- Nomes próprios (empresas, instituições, produtos) e números e links não mudam. Nome, e-mail, telefone, links, empresas e instituições nem são enviados ao serviço de tradução.
- São traduzidos: cargo/título, local, títulos dos blocos, tópicos e textos, cargos, períodos (ex.: "Presente" ↔ "Present") e cursos.

### 6.4 Modelo escolhido
**gpt-oss-20b** (id `openai/gpt-oss-20b`) pela **OpenRouter**, no formato compatível com OpenAI: endereço `https://openrouter.ai/api/v1` e chave no cabeçalho `Authorization: Bearer` (segredo `LLM_API_KEY`). Modelo **reserva**: `openai/gpt-oss-120b`, na mesma chave. Esforço de raciocínio `low` (`LLM_REASONING_EFFORT`; o gpt-oss aceita `low`, `medium` e `high`).
- **Modelo reserva:** se o principal recusa por excesso de demanda ou não responde, o `llm.ts` usa o reserva por 60 s e volta ao principal. Quando isso acontece, o usuário vê um aviso neutro na tela.
- **Por que a OpenRouter:** o mesmo modelo, uma só chave e vários provedores por trás. O código não mudou: só trocaram as variáveis e o segredo.
- **Histórico de provedores:** (1) NVIDIA gratuita com o gpt-oss-120b: gerava só de 15 a 40 tokens por segundo (análise de 11 a 93 s); (2) Groq com o gpt-oss-20b: rápida (análise de 1,2 a 1,8 s), mas em 06/10 deixou de aceitar novas assinaturas e o plano recusava pedidos por limite de tokens por minuto (HTTP 429 e 413); (3) Google AI Studio com o Gemini 3.1 Flash-Lite e, como reserva, o Gemini 3.5 Flash; (4) OpenRouter com o gpt-oss, a escolha atual. As chaves dos provedores antigos não estão no código nem no histórico do Git.
- **Custo:** consultar os preços na OpenRouter antes de fixar o preço do plano; o plano pro dá 60 créditos por R$ 39,90, e cada análise, tradução ou exportação gratuita gasta 1 crédito (seção 4.4). A conta de custo por análise deve ser refeita com os preços e os tokens medidos nos logs.
- **Troca de provedor** = mudar `LLM_BASE_URL`, `LLM_MODEL`, `LLM_FALLBACK_MODEL` e o segredo `LLM_API_KEY`; nenhum código muda.
- **Desenvolvimento local:** `.env` com a chave (ver `web/.env.example`).
- Validar o modelo com ~15 pares reais currículo+vaga (pt e en), medindo: JSON válido, fatos inventados, evidências corretas, qualidade do texto. **Ainda não feito**; os testes até agora foram com poucos exemplos.

### 6.6 Conferência da introdução com o Jev
O LLM escreve a introdução sugerida e o **Jev** (TypeSafe) a confere antes de ela chegar à tela. Sem a chave `TYPESAFE_API_KEY`, a conferência é pulada e a análise funciona como antes.
- **Duas notas de 0 a 1**: *fidelidade* (sem informação falsa: nada que o currículo não sustente e nada exagerado) e *adequação* (quanto o texto aborda o que a vaga pede, usando só o que o currículo tem). **Só a fidelidade decide** se o texto é aprovado ou refeito, com limite de **0,80**. A adequação é só informação: aparece como porcentagem na tela e não reprova nem refaz o texto (decisão do dono do projeto: adequação baixa não indica "resposta ruim da IA").
- **Mudar muito o texto não conta contra.** Foi retirada a pergunta que comparava com o original, porque punia justamente a adaptação à vaga.
- **Checagens de código antes do Jev**: números e habilidades "não possui" que não existem no currículo reprovam o texto sem chamar o Jev.
- **Refação**: se o texto não passa na fidelidade, o LLM o refaz **no máximo 1 vez** (`MAX_REDOS`); sem aprovação, vale a tentativa de maior fidelidade. Eram 3 refações, mas não subiam a nota e dobravam o tempo.
- **Tela**: a nota de fidelidade fica em cima do texto sugerido (selo verde quando passa; aviso âmbar quando não passa); a adequação à vaga aparece em porcentagem acima da tabela de habilidades. Se o Jev falhar, a análise segue com um aviso.
- **Medido em produção com gpt-oss-20b na Groq** (a medir de novo com a OpenRouter): análise completa em **1,2 a 1,8 s**, com fidelidade de 0,82 a 0,96 e adequação de 0,89 a 0,96, sem refações.
- **Em aberto:** calibrar o limite de 0,80 e as perguntas com ~15 pares reais; o Jev é do agente `JEV/<tarefa>` (seção 12).

## 7. Segurança e custo
- **RLS** em todas as tabelas; nada de `service_role` no navegador. As tabelas de créditos e de pagamento não têm política pública: só o Worker, com a `service_role`, chega nelas.
- **API que falha fechada:** sem login configurado, sem a chave do banco de créditos ou com o banco fora do ar, recusa (401, 402 ou 503) em vez de liberar. Corpo dos pedidos com tamanho máximo.
- **Cabeçalhos e CSP** em todo o site e na API (seção 3): scripts só do próprio site e do Turnstile; o site só conversa com ele mesmo, o Supabase e o Turnstile; nenhum outro site pode embuti-lo.
- **Captcha** (Turnstile) no login, no cadastro e no "Esqueci minha senha"; confirmação de e-mail ligada.
- **Limites**: tamanho máximo do texto da vaga (~15 mil caracteres) e do PDF; limite por usuário (20 por hora) e teto diário total; 5 tentativas de pagamento por hora por usuário; só aceita pedidos do próprio site (cabeçalho `Origin`).
- **Pagamento:** CPF não guardado, cartão fora do nosso servidor, aviso de pagamento autenticado por token (comparação em tempo constante) e processado uma vez por pagamento.
- **Privacidade:** política de privacidade publicada (seção 4.6); exclusão de conta que apaga tudo (`on delete cascade`).
- **Segredos**: chaves só como "Segredo" no painel da Cloudflare ou nos secrets do Supabase; `.env` local fora do Git (`.gitignore` desde o primeiro commit). Em 12/10/2026 foi feita uma varredura nos arquivos versionados e nos 106 commits do histórico: nenhuma chave de API ou senha. As únicas credenciais no código são as públicas por desenho (a chave `anon` do Supabase e a chave do site do Turnstile). O repositório é **público**, por isso os dados do vendedor (nome, CPF, endereço e e-mail) saíram do código e vão em segredos da Cloudflare (seção 4.6). **Atenção:** eles ficaram no histórico do Git (commits do PR #47), que não é apagado; só tornar o repositório privado, ou recriá-lo sem o histórico, remove esse acesso. Os mesmos dados continuam visíveis nas páginas de termos do site, como a lei exige.
- **CI endurecido:** token do fluxo só de leitura e ações do GitHub fixadas pelo código (SHA). O Dependabot do GitHub abre PRs de atualização de dependências.
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

## 9. Estrutura de pastas

A raiz é o repositório `curriculomaker`.

```
curriculomaker/
├─ PLANO.md
├─ comparacao-llms-curriculo.md
├─ .github/workflows/ci.yml        # lint + testes + build a cada PR
├─ web/                            # site (Vite) e Worker (um só projeto da Cloudflare)
│  ├─ src/
│  │  ├─ features/                 # auth, billing, credits, editor, export, import-pdf,
│  │  │                            # job-match, motion, notice, preview, sync, translate
│  │  ├─ legal/                    # termos de uso e política de privacidade (+ seller.ts)
│  │  ├─ lib/                      # schemas (zod), plans.ts, credits.ts, i18n, supabase…
│  │  └─ store/
│  ├─ worker/                      # API em /api/* (seção 3)
│  ├─ tests/                       # 140 testes (node --test)
│  ├─ public/_headers              # cabeçalhos de segurança do site estático
│  ├─ wrangler.jsonc               # configuração do Worker e variáveis públicas
│  └─ .env.example
└─ supabase/
   └─ migrations/                  # resumes, credits, billing (rodar no SQL Editor, em ordem)
```

## 10. Roadmap

| Fase | Entrega | Critério de pronto |
|---|---|---|
| 0 | Repositório, Vite + TS + Tailwind, lint, `.gitignore`, `.env.example` | App sobe em branco |
| 1 | Schemas Zod do currículo + editor manual com blocos arrastáveis + preview + export PDF ATS (dados em `localStorage`) + i18n pt/en | Reordenar blocos muda o PDF |
| 2 | **Feito, ligado em produção (aguarda teste manual).** Supabase: projeto, migrations, Auth (e-mail e senha), salvar/carregar currículos com RLS | Dois usuários não veem dados um do outro |
| 3 | **Feito, em produção.** Adequação à vaga: Worker `/api/analyze`, provedor plugável (Gemini 3.1 Flash-Lite), conferência com o Jev, tela com diff + tabela, no idioma da aba ativa. Falta validar com ~15 pares reais | Saída validada; nada inventado nos testes |
| 4 | **Feito e depois removido** (PR #30): o wizard "Montar por perguntas" saiu; as dicas foram para os blocos do editor | Dicas dentro dos blocos |
| 5 | **Feito.** Importar PDF (extração de texto e separação em blocos, sem LLM) | PDFs reais de teste separados em blocos, sem alterar texto |
| 5.1 | **Feito, em produção.** Abas de idioma pt-BR/en, um currículo por aba, tradução ao trocar de aba e aviso na importação de PDF (seção 5.4) | Trocar de aba muda currículo, interface, introdução sugerida e PDF |
| 5.2 | **Feito, em produção.** Prévia em páginas A4 com contagem de páginas e tamanho da fonte de 8 a 12 pt (seção 5.5) | A prévia mostra quantas páginas o PDF terá |
| 5.3 | **Feito, em produção.** Segurança: cabeçalhos e CSP, API que falha fechada, captcha (Turnstile), CI com testes | Testes e CI verdes |
| 5.4 | **Feito, em produção.** Créditos no servidor (5 gratuitos por 30 dias), contador, travas da conta sem crédito, cobrança no Exportar PDF e no Ctrl+P (seção 4.4) | Sem crédito: edição de texto livre; IA, tradução e exportação travadas |
| 5.5 | **Feito, em produção na conta de teste.** Planos e pagamento do plano pro pelo Asaas, esqueci minha senha, termos de uso, privacidade e reembolso de 7 dias (seções 4.3 a 4.6) | Pagamento de teste libera 60 créditos; reembolso revoga |
| 6 | **Falta:** variantes por vaga e histórico de análises. **Feito:** planos gratuito/pago e limites de uso | — |
| 7 | App com Capacitor. **Só inicia com ordem explícita do dono do projeto**, depois de o site estar pronto e testado | Reaproveita schemas e camada de dados |

A fase 1 vem antes do Supabase porque valida o núcleo (blocos + export) sem depender de infraestrutura.

## 11. Decisões

**Tomadas**
- Idiomas: português e inglês (interface e currículo), por **abas de idioma** (seção 5.4). Um texto nunca fica em dois idiomas: não existe mais a opção de gerar a introdução nos dois idiomas, e a IA não precisa detectar o idioma.
- Idioma de saída do LLM: o da aba ativa. O PDF sai no idioma da aba. A tradução do currículo acontece ao trocar de aba, se o usuário aceitar, mantendo os termos técnicos em inglês sem traduzir (seção 6.5).
- Planos (outubro/2026): **gratuito** com 5 créditos por 30 dias e **pro** a R$ 39,90 por mês com 60 créditos e exportação livre; cobrança pelo **Asaas**, como pessoa física (CPF), com assinatura mensal por cartão, Pix ou boleto. Appmax fica como alternativa futura (taxas menores). Pix Automático está fora (exige CNPJ).
- App: Capacitor, somente após o web estar pronto e com ordem explícita.
- Hospedagem: Cloudflare **Workers** (site e API no mesmo projeto), domínio `currimaker.niuai.com.br`, repositório GitHub `curriculomaker`. A VPS Hetzner e o Swarm não entram no início.
- LLM: **gpt-oss-20b pela OpenRouter**, com o gpt-oss-120b de reserva e esforço de raciocínio `low` (seção 6.4). Passou por NVIDIA, Groq e Google antes.
- Conferência da introdução com o Jev: mede informação falsa (decide) e adequação à vaga (só informa, em porcentagem); mudar muito o texto não é falha (seção 6.6).
- Interface em português para o fluxo de pagamento e os textos legais; a aba English serve para o **conteúdo** do currículo, não para a interface de cobrança.
- Template: um único, ATS-friendly.
- Importação de PDF: só reconhecimento de texto, sem LLM e sem reescrever; o que não for reconhecido o usuário adiciona à mão.

- Backend (análise, tradução, exportação, créditos e pagamento): Worker da Cloudflare, com limite por usuário (20 por hora) e teto diário (200) por Durable Object; a tradução tem contadores próprios.
- Login e banco (06/10): e-mail e senha, login obrigatório, só o currículo base (seção 4.3). Créditos, planos e pagamento vieram em seguida (seções 4.4 e 4.5).

**Em aberto**
0. **Antes de vender de verdade:** trocar `ASAAS_API_KEY` pela chave de produção (`$aact_prod_...`) e recadastrar o aviso de pagamento (webhook) na conta real do Asaas, com o mesmo `ASAAS_WEBHOOK_TOKEN`; fazer uma compra real de valor baixo e um reembolso de teste; conferir se o Site URL do Supabase é `https://currimaker.niuai.com.br`.
1. Revisão dos termos e da política por um advogado quando o negócio crescer; o texto atual é um modelo. Decidir o que fazer com o repositório público: o CPF e o endereço residencial continuam no histórico do Git, no PR #47 (seção 7).
2. Validar a qualidade com cerca de 15 pares de currículo e vaga (pt e en): JSON válido, fatos inventados, evidências corretas, qualidade do texto, agora com o gpt-oss pela OpenRouter.
3. Calibrar o limite de 0,80 da fidelidade e as perguntas do Jev com esses mesmos pares.
4. Conta de custo por análise com os preços da OpenRouter e os tokens dos logs (seção 6.4).
5. A mensagem de espera da análise e da tradução na tela ainda diz "até 1 minuto", o que deixou de ser verdade com um provedor rápido.
6. Traduzir os e-mails do Supabase (confirmação e nova senha) para o português; hoje saem em inglês.
7. Limpeza de padrões antigos: o código e o `.env.example` ainda citam a NVIDIA como padrão do `llm.ts` (só valem se as variáveis faltarem), e as telas de bloqueio, créditos, exportação e "esqueci minha senha" ainda têm texto em inglês que ninguém vê (a interface de cobrança é só em português).
8. Reembolso é manual (painel do Asaas); definir um fluxo e um prazo de resposta de atendimento.
9. CI: roda lint, testes e build. Falta rodar os testes de SQL (PGlite) no CI. No Windows, o teste que compara `public/_headers` com `worker/security.ts` falha por causa do fim de linha (CRLF); no CI passa.
10. Fase 7 (app com Capacitor): **só com ordem explícita do dono do projeto**.

## 12. Fluxo de trabalho no Git
Vários agentes (sessões do Claude) trabalham no mesmo repositório, então o fluxo é o de equipes de software:
- **Um branch por tarefa**, curto, criado a partir da `origin/main` atualizada, com PR, CI e **apagado depois do merge** (o GitHub apaga sozinho). Nunca reutilizar um branch já mesclado.
- **Nomes:** `pilot/<tarefa>` para o Claude principal (ex.: `pilot/abas-de-idioma`) e `JEV/<tarefa>` para o agente que cuida da conferência com o Jev (ex.: `JEV/ajustar-fidelidade`).
- **Uma pasta de trabalho (worktree) por agente**, para um não sobrescrever os arquivos do outro: `curriculo-pilot` (Claude principal) e `curriculo-jev`.
- **`main` protegida** pelo ruleset `proteger-main`: só recebe código por PR, com o check `build` do CI passando (lint, testes e build), sem push forçado e sem apagar o branch. A lista de exceções (bypass) está vazia. Merge por *squash*, feito pelo dono do projeto.
- **Cada agente só mexe nos próprios arquivos**; quando uma mudança atravessa os arquivos do outro, avisa antes e combina a divisão.
- **Cloudflare:** a `main` vai a produção pelo Workers Builds; cada branch ganha um preview (`wrangler preview`, o bloco `previews` do `wrangler.jsonc`); o check `Workers Builds: currimaker` também aparece em cada PR. Segredos (chaves de API) ficam como tipo "Segredo" no painel, nunca em arquivo.