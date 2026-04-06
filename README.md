# ATTIVOS

Sistema de gestão de ativos imobilizados (interface web).

## Executar localmente

**Pré-requisitos:** Node.js

1. `npm install`
2. Copie `.env.example` para `.env` e preencha as variáveis `VITE_*`.
3. `npm run dev` → app em **http://localhost:4000**

## Supabase (banco + Auth)

### 1) SQL

No **SQL Editor** do projeto:

1. Se você usou a versão antiga com tabela `public.users`, rode antes `supabase/migrate_legacy_users.sql`.
2. Execute o arquivo **`supabase/schema.sql`** (perfis, RLS, trigger em `auth.users`).

### 2) Auth (recomendado para desenvolvimento)

Em **Authentication → Providers → Email**: habilite e, para testar rápido, considere **desativar confirmação de e-mail** (em produção, deixe ativa e use o fluxo de confirmação).

### 3) Edge Functions (admin criar / excluir / trocar senha)

O painel “Usuários” chama funções com **service role** no servidor. Com a [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase link --project-ref SEU_REF
supabase functions deploy admin-create-user
supabase functions deploy admin-delete-user
supabase functions deploy admin-update-user
```

As variáveis `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` são injetadas automaticamente nas funções hospedadas.

### 4) Administrador fixo (renan@reetech.com.br)

1. No Supabase: **Project Settings → API**, copie a **`service_role`** (secret).
2. No `.env`, preencha **`SUPABASE_SERVICE_ROLE_KEY`** (já existem `ATTIVOS_ADMIN_EMAIL`, `ATTIVOS_ADMIN_PASSWORD` e nome como padrão).
3. Rode **`npm run seed:admin`** — cria o usuário ou atualiza senha/perfil para **admin**.

O atalho `VITE_DEFAULT_ADMIN_EMAIL` aponta para o mesmo e-mail (digite `admin` no campo de login).

### 5) Primeiro acesso (sem seed script)

- **Primeiro usuário** cadastrado no Auth recebe perfil **administrator** automaticamente (via trigger no SQL).
- Para abrir cadastro público na tela de login, use no `.env`: `VITE_ALLOW_SIGNUP=1`.
- Atalho: se `VITE_DEFAULT_ADMIN_EMAIL` estiver definido, digitar `admin` no campo de e-mail redireciona o login para esse endereço.

### 6) Seed de demonstração

Após o login, se **categorias** e **ativos** estiverem vazios, o app grava no banco os dados de exemplo de `src/mockData.ts` (sem usuários fictícios: responsável dos ativos vira o seu usuário logado).

## Variáveis de ambiente

Ver `.env.example`.

## Deploy em produção (VPS)

Guia completo: **[deploy/README.md](deploy/README.md)** (Nginx, Docker, Caddy, Supabase Auth URL, Edge Functions).

- Build: `npm run build` → pasta **`dist/`** (defina `VITE_*` antes, ex. via `.env.production`).
- Modelo de variáveis para produção: **`.env.production.example`**.
- Docker: `docker compose --env-file .env.production up -d --build` na pasta `attivos/`.
