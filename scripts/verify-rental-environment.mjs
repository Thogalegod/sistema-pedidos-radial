// This restoration is authorized only against IURQ. Validate before Next executes app code.
if (process.env.VERCEL === '1') {
  const expected = 'https://iurqgskfuupslrghgtej.supabase.co';
  let actual;
  try { actual = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin; } catch { /* Fail closed. */ }
  if (actual !== expected) {
    console.error('Publicação interrompida: este lote de restauração exige o ambiente IURQ.');
    process.exit(1);
  }
  console.log('Ambiente IURQ confirmado para a restauração.');
}
