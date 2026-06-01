# Frotas · Veículos + DETRAN

## O que este pacote adiciona

- Submenu `Frotas > Veículos`.
- Tela para cadastrar/editar veículos com placa e RENAVAM.
- Importação automática do relatório de veículos pelo menu `Relatórios > Importar Relatórios`.
- Badge `DETRAN` quando o veículo for confirmado pela integração.
- Edge Function base `sync-veiculos-detran` para centralizar a chamada segura ao DETRAN.

## Upload do relatório de veículos

O arquivo pode conter colunas como:

- Nome
- Placa
- Marca
- Modelo
- Cor
- Ano
- Tipo
- Coordenação
- Supervisão
- Funcionário
- Hodômetro
- Renavam
- Valor Mensal
- Dia de Vencimento
- R$/Km

Ao fazer upload, a planilha é organizada em `frotas_veiculos`.

## SQL

Rode no Supabase:

```sql
supabase/migrations/20260508_frotas_veiculos_importacao_detran.sql
```

## Edge Function

Depois de subir os arquivos, publique:

```bash
npx supabase functions deploy sync-veiculos-detran
```

A função já atualiza o veículo como `CONFIRMADO`, mas o trecho da chamada real do DETRAN deve ser conectado ao endpoint oficial usando seus tokens/segredos do projeto.
