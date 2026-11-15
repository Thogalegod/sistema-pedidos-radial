import { FichaComplementarFormPage } from '@/components/manutencao-preventiva/FichaComplementarFormPage';
import { fichaComplementarDefinitions } from '@/lib/manutencao-preventiva/fichas-complementares';

export default function FichaParaRaiosPage() {
  return <FichaComplementarFormPage definition={fichaComplementarDefinitions[1]} />;
}
