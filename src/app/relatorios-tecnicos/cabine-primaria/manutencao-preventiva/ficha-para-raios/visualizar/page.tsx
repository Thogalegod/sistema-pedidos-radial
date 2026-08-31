import { FichaComplementarVisualizarPage } from '@/components/manutencao-preventiva/FichaComplementarVisualizarPage';
import { fichaComplementarDefinitions } from '@/lib/manutencao-preventiva/fichas-complementares';

export default function FichaParaRaiosVisualizarPage() {
  return <FichaComplementarVisualizarPage definition={fichaComplementarDefinitions[1]} />;
}
