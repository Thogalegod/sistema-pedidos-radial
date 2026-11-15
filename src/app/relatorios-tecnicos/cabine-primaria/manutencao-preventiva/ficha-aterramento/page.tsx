import { FichaComplementarFormPage } from '@/components/manutencao-preventiva/FichaComplementarFormPage';
import { fichaComplementarDefinitions } from '@/lib/manutencao-preventiva/fichas-complementares';

export default function FichaAterramentoPage() {
  return <FichaComplementarFormPage definition={fichaComplementarDefinitions[4]} />;
}
