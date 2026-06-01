
/**
 * Exemplo de ponte de API para integrar o módulo PROGRAMACAO com o backend.
 * Ajuste conforme o seu worker/supabase client.
 */
window.PROGRAMACAO_API_EXAMPLE = {
  async getAlojamentos() {
    // Exemplo Supabase:
    // const { data, error } = await supabase
    //   .from('vw_alojamentos_ativos')
    //   .select('*')
    //   .order('nome');
    // if (error) throw error;
    // return data;

    return [
      { id: "1", nome: "Alojamento Cascavel Centro", cidade_uf: "Cascavel/PR", ativo: true },
      { id: "2", nome: "Alojamento Londrina Norte", cidade_uf: "Londrina/PR", ativo: true },
    ];
  },

  async getCidades() {
    return [
      "Cascavel/PR",
      "Londrina/PR",
      "Maringá/PR",
      "Primavera do Leste/MT"
    ];
  },

  async saveProgramacaoRow(payload) {
    // Exemplo Supabase:
    // const row = {
    //   data_referencia: new Date().toISOString().slice(0, 10),
    //   colaborador_id: payload.colaborador_id,
    //   nome: payload.nome,
    //   status: payload.status,
    //   cafe: payload.cafe,
    //   almoco: payload.almoco,
    //   janta: payload.janta,
    //   transporte: payload.transporte,
    //   estadia: payload.extras.estadia,
    //   cidade_uf: payload.extras.cidade_uf,
    //   alojamento_id: payload.extras.alojamento_id,
    //   checkin: payload.extras.checkin,
    //   checkout: payload.extras.checkout,
    //   chegada: payload.extras.chegada,
    //   recarga: payload.extras.recarga,
    //   lavagem: payload.extras.lavagem,
    //   manutencao_solicitada: payload.extras.manutencao_solicitada
    // };
    //
    // const { error } = await supabase
    //   .from('programacao_colaborador')
    //   .upsert(row, { onConflict: 'data_referencia,colaborador_id' });
    // if (error) throw error;

    return { ok: true, payload };
  },

  async createFrotaSolicitacao(payload) {
    // Exemplo Supabase:
    // const { error } = await supabase.from('frota_solicitacoes').insert(payload);
    // if (error) throw error;

    return { ok: true, payload };
  }
};
