# Build de produção + Nginx para servir o SPA.
# As variáveis VITE_* são embutidas no bundle no momento do build.

FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_SUPABASE_URL=""
ARG VITE_SUPABASE_ANON_KEY=""
ARG VITE_DEFAULT_ADMIN_EMAIL=""
ARG VITE_ALLOW_SIGNUP=0
ARG VITE_SEED_DEMO_DATA=0
ARG VITE_BASE_PATH=/

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_DEFAULT_ADMIN_EMAIL=$VITE_DEFAULT_ADMIN_EMAIL \
    VITE_ALLOW_SIGNUP=$VITE_ALLOW_SIGNUP \
    VITE_SEED_DEMO_DATA=$VITE_SEED_DEMO_DATA \
    VITE_BASE_PATH=$VITE_BASE_PATH

RUN npm run build

FROM nginx:alpine
COPY deploy/nginx-docker.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
