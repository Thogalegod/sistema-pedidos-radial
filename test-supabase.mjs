import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://iurqgskfuupslrghgtej.supabase.co',
  'sb_publishable_n7-pv8Cy4qAF6qvVYROgSA_GYPp9Nd6'
);

async function testStructural() {
  const { data, error } = await supabase.from('relatorios_transformador').insert({
    // Omit required field
    numero_relatorio: '123'
  });

  console.log("Error:", error);
}

testStructural();
