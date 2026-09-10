# RIFTFOUND

Marketplace comunitário para comprar, vender e trocar cartas de Riftbound. A interface inclui exploração de ofertas, menor preço em destaque, anúncio de cartas, want list, pontos de entrega e cadastro/login via Supabase.

## Rodar localmente

```bash
npm install
copy .env.example .env.local
npm run dev
```

Preencha `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` para ativar autenticação e persistência. O projeto local já está configurado com as credenciais públicas do projeto fornecido e o arquivo `.env.local` não deve ser commitado.

## Supabase

1. Crie um projeto no Supabase.
2. Abra **SQL Editor** e execute todo o conteúdo de [`supabase/schema.sql`](./supabase/schema.sql).
3. Em **Authentication > URL Configuration**, adicione a URL local e a URL de produção da Vercel.
4. Configure as variáveis de ambiente na Vercel.

O schema cria perfis, catálogo espelhado do RiftCodex, anúncios em lote, locais/dias de entrega, want list, favoritos, políticas RLS e a view `marketplace_listings`. A interface usa o Supabase diretamente para carregar e salvar todos esses dados.

Se o schema inicial já foi executado, rode também [`supabase/migrations/20260908_functional_fixes.sql`](./supabase/migrations/20260908_functional_fixes.sql). A migração libera a atualização segura do cache de cartas e evita colisão de nomes de usuário em novos cadastros.

## RiftCodex

As rotas `/api/cards` e `/api/cards/names` pesquisam um snapshot normalizado do catálogo oficial armazenado em `data/riftcodex-catalog.json`. Isso evita indisponibilidade em produção quando a infraestrutura da API externa bloqueia requisições da Vercel. Para atualizar as cartas e imagens diretamente da RiftCodex, execute `npm run sync:cards` e publique o arquivo atualizado.

Na tela **Vender cartas**, o fluxo é: escanear automaticamente ou buscar no catálogo → adicionar várias cartas → editar preço/quantidade/condição → selecionar pontos de entrega → publicar todos os anúncios em uma única operação. O scanner faz OCR no próprio navegador e usa o catálogo local para encontrar a versão correspondente; nenhuma foto capturada é enviada ou armazenada.

## Publicar na Vercel

Importe o repositório na Vercel, mantenha o framework como Next.js e adicione as duas variáveis públicas do Supabase. O comando padrão `next build` já foi validado.
