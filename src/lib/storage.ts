import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function uploadArquivo(
  file: File,
  pasta: string,
  nomeArquivo: string
): Promise<string | null> {
  const caminho = `${pasta}/${nomeArquivo}`;

  const { error } = await supabase.storage
    .from('documentos-cabine')
    .upload(caminho, file, {
      upsert: true,
      contentType: file.type,
    });

  if (error) {
    console.error('Erro no upload:', error);
    return null;
  }

  return caminho;
}

export async function getUrlArquivo(caminho: string): Promise<string | null> {
  const { data } = await supabase.storage
    .from('documentos-cabine')
    .createSignedUrl(caminho, 3600); // URL válida por 1 hora

  return data?.signedUrl ?? null;
}

export async function uploadCreaRoberto(file: File): Promise<string | null> {
  return uploadArquivo(file, 'crea', 'roberto-fontes-lopes.jpg');
}
