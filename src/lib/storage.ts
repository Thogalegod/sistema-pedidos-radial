import { supabase } from '@/lib/supabase';

export async function uploadArquivo(
  file: File,
  pasta: string,
  nomeArquivo: string
): Promise<string> {
  const caminho = `${pasta}/${nomeArquivo}`;

  const { error } = await supabase.storage
    .from('documentos-cabine')
    .upload(caminho, file, {
      upsert: true,
      contentType: file.type,
    });

  if (error) {
    throw new Error(`Falha ao enviar ${nomeArquivo}: ${error.message}`);
  }

  return caminho;
}

export async function getUrlDownload(caminho: string, nome: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('documentos-cabine')
    .createSignedUrl(caminho, 300, { download: nome });

  if (error || !data?.signedUrl) {
    throw new Error('Não foi possível preparar o download.');
  }

  return data.signedUrl;
}

export async function getUrlArquivo(caminho: string): Promise<string | null> {
  const { data } = await supabase.storage
    .from('documentos-cabine')
    .createSignedUrl(caminho, 3600); // URL válida por 1 hora

  return data?.signedUrl ?? null;
}

export async function uploadCreaRoberto(file: File): Promise<string> {
  return uploadArquivo(file, 'crea', 'roberto-fontes-lopes.jpg');
}
