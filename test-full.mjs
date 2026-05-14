import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://iurqgskfuupslrghgtej.supabase.co',
  'sb_publishable_n7-pv8Cy4qAF6qvVYROgSA_GYPp9Nd6'
);

async function run() {
  const email = `test${Date.now()}@gmail.com`;
  const password = 'radialpassword123!'; 
  
  console.log("Registering:", email);
  let { data, error } = await supabase.auth.signUp({ email, password });
  
  if (error) {
    console.error("SignUp error:", error);
    return;
  }
  
  console.log("Logged in:", data.user.id);
  
  const insertPayload = {
    numero_relatorio: 'RT-202605-999',
    criado_por: data.user.id,
    cliente_nome: 'Teste',
    cliente_endereco: 'Teste',
    cliente_cidade: 'Teste',
    cliente_uf: 'SP',
    cliente_cnpj: '',
    cliente_ie: '',
    observacoes: '',
    fabricante: '',
    numero_serie: '',
    potencia_kva: 112.5,
    tensao_at_nominal: 13800,
    tensao_bt: '380',
    tensao_bt_label: '380 / 220 V',
    resfriamento: 'LN',
    grupo_ligacao: 'Subtrativa',
    tipo_oleo: 'Mineral',
    procedencia_oleo: 'BR',
    tap_despacho: 13800,
    taps: [13800, 13200],
    responsavel_nome: 'Teste',
    responsavel_crea: 'Teste',
    data_relatorio: '2026-05-13',
    temperatura_c: 26,
    umidade_relativa: undefined,
    valores_calculados: { test: true },
    status: 'gerado'
  };

  const { data: insData, error: insErr } = await supabase.from('relatorios_transformador').insert(insertPayload);
  
  if (insErr) {
    console.log("INSERT ERROR:");
    console.log(JSON.stringify(insErr, null, 2));
  } else {
    console.log("INSERT SUCCESS!");
  }
}

run();
