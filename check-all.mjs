import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://iurqgskfuupslrghgtej.supabase.co';
const anonKey = 'sb_publishable_n7-pv8Cy4qAF6qvVYROgSA_GYPp9Nd6';

const supabase = createClient(supabaseUrl, anonKey);

async function check() {
  const { data, error } = await supabase
    .from('relatorios_transformador')
    .select('id');

  console.log('Error:', error);
  console.log('Data:', data);
}

check();
