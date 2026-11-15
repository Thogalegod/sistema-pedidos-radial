import { FichaComplementarVisualizarPage } from '@/components/manutencao-preventiva/FichaComplementarVisualizarPage';
import { fichaComplementarDefinitions } from '@/lib/manutencao-preventiva/fichas-complementares';

export default function FichaTcTpVisualizarPage() {
  return <FichaComplementarVisualizarPage definition={fichaComplementarDefinitions[2]} />;
}
