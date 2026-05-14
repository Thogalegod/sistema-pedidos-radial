import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://iurqgskfuupslrghgtej.supabase.co';
const anonKey = 'sb_publishable_n7-pv8Cy4qAF6qvVYROgSA_GYPp9Nd6';

const supabase = createClient(supabaseUrl, anonKey);

async function check() {
  const { data, error } = await supabase
    .from('relatorios_transformador')
    .select('*')
    .eq('id', 'b76f8b72-84d6-46a3-949a-6eb437267b27')
    .single();

  console.log('Error:', error);
  console.log('Data:', data);
}

check();
