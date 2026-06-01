# Frotas > Veículos — Sincronização DETRAN

Este pacote ajusta a sincronização para puxar a frota diretamente do DETRAN Frotista, sem depender de RENAVAM previamente cadastrado no painel.

## Como funciona

A Edge Function `sync-veiculos-detran`:

1. Lê as credenciais em **TI > Integrações**.
2. Gera token por empresa/CNPJ.
3. Consulta:
   - `/api/v1/consulta/listar-veiculos`
   - `/api/v1/consulta/listar-veiculos-venda`
4. Detecta paginação automaticamente, como no Apps Script modelo.
5. Faz `upsert` na tabela `frotas_veiculos` pela placa.
6. Marca os veículos com o selo DETRAN.

## Chaves esperadas em TI > Integrações

Crie uma integração com código/nome contendo `DETRAN` ou `FROTISTA`.

Campos da integração:

- Base URL: `https://detranfrotistaapi.paas.pr.gov.br`
- Auth URL: `https://auth-cs.identidadedigital.pr.gov.br/centralautenticacao/api/v1/token/jwt`

Secrets aceitos:

- `CONSUMER_ID` ou `DETRAN_CONSUMER_ID`
- `SCOPE` ou `DETRAN_SCOPE`
- `CLIENT_ID_04`
- `CLIENT_SECRET_04`
- `EMPRESA_04`
- `CLIENT_ID_29`
- `CLIENT_SECRET_29`
- `EMPRESA_29`
- `CLIENT_ID_35`
- `CLIENT_SECRET_35`
- `EMPRESA_35`

Também aceita sem sufixo:

- `CLIENT_ID`
- `CLIENT_SECRET`
- `EMPRESA`

## Depois do upload

1. Rode o SQL:
   - `supabase/migrations/20260508_frotas_veiculos_detran_listagem.sql`
2. No Supabase Dashboard, abra:
   - Edge Functions > `sync-veiculos-detran` > Code
3. Substitua o `index.ts` pelo arquivo deste pacote:
   - `supabase/functions/sync-veiculos-detran/index.ts`
4. Clique em Deploy.
5. No painel, vá em:
   - Frotas > Veículos > Puxar frota DETRAN

