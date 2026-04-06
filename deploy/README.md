# Deploy do ATTIVOS na VPS

O frontend é um **SPA (Vite + React)**. O backend de dados é o **Supabase** (hospedado). Na VPS você só precisa servir os arquivos estáticos de `dist/` (ou usar Docker).

## 1. Variáveis de ambiente (build)

O Vite **injeta** no JavaScript apenas variáveis com prefixo `VITE_` **no momento do `npm run build`**. Depois do build, mudar `.env` na VPS **não altera** o bundle — é preciso **buildar de novo**.

Modelo: copie `.env.production.example` para `.env.production`, preencha e use no build.

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `VITE_SUPABASE_URL` | Sim | URL do projeto (Settings → API) |
| `VITE_SUPABASE_ANON_KEY` | Sim | chave **anon** (nunca a `service_role` no frontend) |
| `VITE_DEFAULT_ADMIN_EMAIL` | Não | Atalho se o usuário digitar `admin` no login |
| `VITE_ALLOW_SIGNUP` | Não | `1` para exibir cadastro público (padrão recomendado em produção: `0`) |
| `VITE_SEED_DEMO_DATA` | Não | **Deixe `0` em produção** |
| `VITE_BASE_PATH` | Não | Se o app não estiver na raiz do domínio, ex.: `/attivos` |

## 2. Supabase (painel)

1. **Authentication → URL configuration**  
   - **Site URL**: `https://seu-dominio.com.br` (ou com subpasta, se aplicável).  
   - **Redirect URLs**: inclua a mesma origem e `http://localhost:4000` se ainda desenvolver localmente.

2. **Edge Functions** (gestão de usuários admin): na pasta do projeto com CLI logado:

   ```bash
   supabase functions deploy admin-create-user
   supabase functions deploy admin-update-user
   supabase functions deploy admin-delete-user
   ```

3. Schema SQL: aplique `supabase/schema.sql` (e migrações necessárias) no projeto correto.

## 3. Build local e envio dos arquivos

Na sua máquina (ou em CI):

```bash
cd attivos
cp .env.production.example .env.production
# edite .env.production
set -a && source .env.production && set +a   # Linux/macOS
# Windows PowerShell: Get-Content .env.production | ForEach-Object { ... } ou defina variáveis manualmente
npm ci
npm run build
```

Envie a pasta **`dist/`** para a VPS, por exemplo:

```bash
rsync -avz --delete dist/ usuario@vps:/var/www/attivos/dist/
```

## 4. Opção A — Nginx (sem Docker)

1. Instale Nginx e (recomendado) **Certbot** para HTTPS.  
2. Ajuste `deploy/nginx-site.example.conf` (`server_name`, `root` → caminho absoluto de `dist`).  
3. Ative o site e recarregue o Nginx.

```bash
sudo nginx -t && sudo systemctl reload nginx
```

## 5. Opção B — Docker Compose na VPS

Na VPS, com o repositório (ou só `Dockerfile` + `docker-compose.yml` + `deploy/`):

1. Crie `.env` com o mesmo conteúdo de `.env.production` (variáveis `VITE_*`).  
2. Suba o container:

```bash
docker compose --env-file .env up -d --build
```

Por padrão a app fica em **http://IP:8080**. Altere `ATTIVOS_HTTP_PORT` no `.env` se quiser outra porta. Coloque um **Nginx/Caddy reverso** na frente com HTTPS e `proxy_pass` para essa porta, se necessário.

Build com argumentos explícitos (sem arquivo):

```bash
docker build \
  --build-arg VITE_SUPABASE_URL=https://xxx.supabase.co \
  --build-arg VITE_SUPABASE_ANON_KEY=eyJ... \
  -t attivos-web .
```

## 6. Opção C — Preview rápido (teste)

Só para validar o build (não use como produção permanente sem TLS):

```bash
npm run preview -- --host 0.0.0.0 --port 4173
```

## 7. App em subpasta (`VITE_BASE_PATH`)

Se `VITE_BASE_PATH=/attivos`, o build gera assets com prefixo correto. O Nginx precisa servir essa pasta:

```nginx
location /attivos/ {
    alias /var/www/attivos/dist/;
    try_files $uri $uri/ /attivos/index.html;
}
```

(Ajuste `alias` e caminhos conforme seu layout.)

## 8. Segurança

- Não commite `.env` / `.env.production` com segredos.  
- A **service_role** do Supabase só em scripts no servidor ou CI, nunca no bundle Vite.  
- Mantenha **HTTPS** em produção.  
- Faça **backup** do banco Supabase conforme a política da empresa.

## 9. Checklist pós-deploy

- [ ] Login com usuário real funciona  
- [ ] Lista de ativos carrega  
- [ ] Exportar CSV/PDF funciona  
- [ ] (Se admin) criar/editar usuário via Edge Functions funciona  
- [ ] `VITE_SEED_DEMO_DATA` desligado em produção  
