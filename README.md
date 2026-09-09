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

`/api/cards` faz proxy para `https://api.riftcodex.com`, usando `/cards/name` para busca por nome e `/cards` para paginação. A resposta real da API vem em `items` e já está normalizada no servidor para o formato usado na interface. A API é pública para operações de leitura, portanto nenhuma chave é necessária.

Na tela **Vender cartas**, o fluxo é: buscar no catálogo → clicar no `+` de várias cartas → editar preço/quantidade/condição → selecionar pontos de entrega → publicar todos os anúncios em uma única operação.

## Publicar na Vercel

Importe o repositório na Vercel, mantenha o framework como Next.js e adicione as duas variáveis públicas do Supabase. O comando padrão `next build` já foi validado.
