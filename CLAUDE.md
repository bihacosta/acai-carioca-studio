# Content Atelier (antigo Açaí Carioca Studio) — instruções para o Claude

## Sobre o projeto
- Content Atelier é a plataforma de planejamento de conteúdo da Bianca; cada cliente (ex.: Açaí Carioca) é um workspace separado.
- O app fica na pasta `acai-carioca-studio-public/` (Next.js + TypeScript + Supabase, hospedado no Vercel).
- É um projeto existente: não recriar nada do zero.
- A tela principal está em `acai-carioca-studio-public/app/page.tsx`; o estilo em `app/globals.css`;
  a conexão com o Supabase em `lib/supabase.ts`; os scripts SQL em `supabase/`.

## Como falar com a dona do projeto
- Responder sempre em português, em linguagem simples (ela não é desenvolvedora).
- Evitar jargão; quando precisar usar um termo técnico, explicar em poucas palavras.

## Regras
1. **Banco de dados (Supabase):** não mudar nada (tabelas, colunas, políticas, storage) sem antes
   explicar o que muda, por quê, e pedir autorização.
2. **RLS:** manter o Row Level Security sempre ativo em todas as tabelas.
3. **Segredos:** nunca colocar chaves secretas nem arquivos `.env` no GitHub. Nunca usar a chave
   `service_role` no código do app. Variáveis novas vão no `.env.example` (sem valores reais).
4. **Visual:** manter o visual atual (cores, fontes, layout) a menos que ela peça mudança.
5. **Mudanças grandes:** antes, explicar o plano, listar os arquivos afetados e dizer se vai
   precisar de novo deploy no Vercel e/ou rodar SQL no Supabase.
6. Preferir mudanças pequenas, uma de cada vez.

## Fluxo de trabalho (automático)
- Toda alteração pedida: fazer numa branch, enviar ao GitHub (push) e **criar ou atualizar o pull request
  automaticamente**, sem perguntar.
- Depois de abrir o PR, mandar o link e explicar em poucas palavras o que mudou e como testar
  (o Vercel gera um link de prévia para cada PR).
- **Não fazer merge sozinho**: a dona do projeto aprova clicando em "Merge" no GitHub (ou pedindo
  explicitamente). O merge publica no site oficial.
- Supabase: mesmo com acesso, qualquer mudança no banco continua exigindo explicação e autorização antes.
