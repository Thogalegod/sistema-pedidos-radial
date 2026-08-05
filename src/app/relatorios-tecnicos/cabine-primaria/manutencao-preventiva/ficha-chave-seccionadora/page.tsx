import { FichaComplementarFormPage } from '@/components/manutencao-preventiva/FichaComplementarFormPage';
import { fichaComplementarDefinitions } from '@/lib/manutencao-preventiva/fichas-complementares';

export default function FichaChaveSeccionadoraPage() {
  return <FichaComplementarFormPage definition={fichaComplementarDefinitions[0]} />;
}
