import { supabase } from '@/lib/supabase';

type DeleteResult = { error: string | null };

/**
 * Exclui um relatório de termografia: remove fotos do Storage e a linha do banco.
 */
export async function deletarRelatorio(
  id: string,
  numeroRelatorio: string,
): Promise<DeleteResult> {
  const prefixo = `termografia/${numeroRelatorio}/`;

  // Listar e remover todas as fotos do relatório no Storage
  const { data: arquivos, error: listError } = await supabase.storage
    .from('documentos-cabine')
    .list(prefixo);

  if (!listError && arquivos?.length) {
    const caminhos = arquivos.map((a) => `${prefixo}${a.name}`);
    const { error: removeError } = await supabase.storage
      .from('documentos-cabine')
      .remove(caminhos);
    if (removeError) {
      return { error: `Erro ao remover fotos: ${removeError.message}` };
    }
  }

  // Excluir a linha do relatório
  const { error: deleteError } = await supabase
    .from('relatorios_termografia')
    .delete()
    .eq('id', id);

  if (deleteError) {
    return { error: `Erro ao excluir relatório: ${deleteError.message}` };
  }

  return { error: null };
}
