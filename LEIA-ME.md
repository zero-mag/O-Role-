# O Rolê+ — pasta pronta pra virar produto real

Essa pasta é a versão que vai pro servidor de verdade (diferente da pasta `ZONA`, que continua sendo o protótipo local). Segue o passo a passo — nenhum passo daqui exige saber programar, só criar contas gratuitas e colar informações.

## Passo 1 — Criar o banco de dados (Supabase, gratuito)

1. Vá em **supabase.com** → "Start your project" → crie a conta (pode ser com Google).
2. Clique em **"New project"**. Dê um nome (ex: `role-mais`) e uma senha forte pro banco (guarde essa senha em algum lugar seguro).
3. Espere uns 2 minutos o projeto ficar pronto.
4. No menu lateral, clique em **"SQL Editor"** → **"New query"**.
5. Abra o arquivo `supabase/schema.sql` desta pasta, copie tudo, cole no editor, e clique em **"Run"**.
   - Isso cria todas as tabelas (contas, rolês, chat, vitrine, promoções) já com as regras de segurança certas.
6. No menu lateral, clique em **"Project Settings" → "API"**.
7. Copie o **"Project URL"** e a chave **"anon public"**.

## Passo 2 — Ligar o app no banco

1. Abra o arquivo `config.js` desta pasta num editor de texto (Bloco de Notas serve).
2. Cole a URL e a chave que você copiou no lugar de `SEU-PROJETO` e `SUA-CHAVE-ANON-AQUI`.
3. Salve o arquivo.

A partir desse momento, o app passa a usar login de verdade e banco compartilhado — pode testar abrindo o `index.html` de novo.

## Passo 3 — Publicar de verdade (sai do seu PC)

1. Vá em **vercel.com** → crie conta gratuita (pode ser com GitHub ou e-mail).
2. Na tela inicial, procure a opção de subir uma pasta direto (**"Deploy" → arrastar a pasta**) — não precisa saber Git.
3. Selecione esta pasta (`Role+`) inteira.
4. Espere publicar — a Vercel te dá um link tipo `role-mais.vercel.app`, já com HTTPS, no ar 24h, de graça.
5. (Opcional, depois) Comprar um domínio próprio (ex: `orole.app`) e apontar pra Vercel — eles têm um passo a passo dentro do próprio painel.

## Passo 4 — Ativar o pagamento real (InfinitePay)

1. No SQL Editor do Supabase, rode também o `supabase/fix-payments.sql` desta pasta (cria a tabela que controla os pedidos de pagamento).
2. No painel do Supabase, vá em **"Edge Functions"** no menu lateral → **"Deploy a new function"** → nome: `verify-payment`.
3. Abra o arquivo `supabase/functions/verify-payment/index.ts` desta pasta, copie tudo, cole no editor da função, e publique.
   - Não precisa configurar nenhuma chave secreta — o Supabase já injeta sozinho o que a função precisa (`SUPABASE_URL` e a chave de serviço).
   - Essa função é o "fiscal": ela confirma com o InfinitePay que o pagamento é real antes de liberar Boost, Rolê+ ou o rolê pago — o navegador nunca consegue se auto-aprovar.

## O que já está pronto nesta pasta

- ✅ Banco de dados completo (`supabase/schema.sql`) — contas, rolês, vitrine, promoções, chat, com segurança (ninguém edita o que não é seu).
- ✅ Login e cadastro reais (senha de verdade, e-mail confirmado) — só ativa quando você preencher o `config.js`.
- ✅ Mapa, feed e chat carregando do banco compartilhado, ao vivo — dois usuários diferentes já se veem e conversam de verdade.
- ✅ **Sem nenhum dado de mentira.** Tirei tudo que era gerado ou simulado: os ~50 negócios fake, as contas demo, as notificações e histórico de pagamento inventados, e o "🤖 IA" que respondia sozinho no chat. O app agora começa vazio de verdade — só existe o que usuários reais criarem.
- ⚠️ Enquanto o `config.js` não estiver preenchido, login e cadastro ficam **bloqueados** (mostra um aviso pedindo pra configurar) — propositalmente, pra não criar conta fake nem por engano.

## O que ainda falta (próximos incrementos, depois que você validar isso)

- Vitrine e promoções ainda só salvam localmente — o esqueleto no banco já existe (tabelas prontas), falta ligar essas telas específicas.
- Verificação de CNPJ e regras de negócio (limite de vitrine sem Rolê+, etc.) ainda rodam só no navegador — próximo passo é mover pra dentro do banco/servidor, pra ninguém conseguir burlar.
- Pagamento (InfinitePay) já é real (Boost, Rolê+ e rolê pago) — só falta você rodar o Passo 4 pra ativar.
- Métricas do dashboard (alcance, entradas no chat, cupons) mostram zero de propósito — ainda não existe coleta de dados real; melhor mostrar vazio do que número inventado.

## Se algo der errado

Copie a mensagem de erro que aparecer (F12 no navegador → aba "Console") e me manda — a maioria dos problemas nessa fase é URL ou chave colada errada no `config.js`.
