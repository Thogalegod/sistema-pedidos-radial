import { FichaComplementarVisualizarPage } from '@/components/manutencao-preventiva/FichaComplementarVisualizarPage';
import { fichaComplementarDefinitions } from '@/lib/manutencao-preventiva/fichas-complementares';

export default function FichaChaveSeccionadoraVisualizarPage() {
  return <FichaComplementarVisualizarPage definition={fichaComplementarDefinitions[0]} />;
}
