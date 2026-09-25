import { FichaComplementarVisualizarPage } from '@/components/manutencao-preventiva/FichaComplementarVisualizarPage';
import { fichaComplementarDefinitions } from '@/lib/manutencao-preventiva/fichas-complementares';

export default function FichaAterramentoVisualizarPage() {
  return <FichaComplementarVisualizarPage definition={fichaComplementarDefinitions[4]} />;
}
