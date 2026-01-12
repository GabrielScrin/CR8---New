# Instruções de Exclusão de Dados (CR-8)

Esta página descreve como solicitar a exclusão de dados pessoais associados ao uso do CR-8.

## 1) Como solicitar a exclusão

Abra uma issue neste repositório com o título **"Exclusão de dados"**:

- Link: https://github.com/GabrielScrin/CR8---New/issues

Inclua no texto:

- E-mail utilizado no login (ou o provedor, ex: Facebook)
- Seu nome (opcional)
- `company_id` (se souber) ou o nome da empresa/cliente criado no CR-8
- O que você deseja excluir:
  - (A) Somente sua conta de usuário
  - (B) Sua conta + dados associados da empresa/cliente (leads, chats, etc.)

## 2) O que será excluído

Dependendo do pedido, podemos excluir:

- Perfil de usuário e acesso (Supabase Auth + `public.users`)
- Associações a empresas/tenants (`public.company_members`)
- Empresas/tenants (`public.companies`) e seus dados
- Leads (`public.leads`)
- Conversas e mensagens (`public.chats`, `public.chat_messages`)

Observação: métricas de anúncios são consumidas via API (Meta Graph) e podem não ser armazenadas permanentemente.

## 3) Prazo

Respondemos e processamos solicitações de exclusão em até **30 dias**.

## 4) Confirmação

Após concluída a exclusão, responderemos na própria issue confirmando a execução.

