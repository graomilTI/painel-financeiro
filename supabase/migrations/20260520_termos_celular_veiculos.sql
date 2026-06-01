-- termos_celular: registros de compra de celular com termo de responsabilidade
CREATE TABLE IF NOT EXISTS public.termos_celular (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  compra_item_id   uuid REFERENCES public.compras_itens(id) ON DELETE SET NULL,
  colaborador_id   uuid,
  colaborador_nome text,
  metodo_pagamento text,  -- 'a_vista' | 'parcelado'
  parcelas         integer DEFAULT 1,
  valor            numeric(12,2),
  status           text NOT NULL DEFAULT 'aguardando_termo', -- 'aguardando_termo' | 'enviado_financeiro'
  termo_url        text,
  observacao       text,
  created_at       timestamptz DEFAULT now(),
  confirmado_em    timestamptz
);

-- termos_veiculos: placeholder para termos de veículos
CREATE TABLE IF NOT EXISTS public.termos_veiculos (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  colaborador_nome text,
  veiculo          text,
  placa            text,
  status           text NOT NULL DEFAULT 'pendente',
  observacao       text,
  created_at       timestamptz DEFAULT now()
);

ALTER TABLE public.termos_celular ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.termos_veiculos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authed_termos_celular" ON public.termos_celular
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authed_termos_veiculos" ON public.termos_veiculos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
