import { Toaster } from 'react-hot-toast';
import { ContentContainer } from '@/components/app-shell/PageHeader';
import { ModulePageContext } from '@/components/contratos-locacoes/ModulePageContext';
import { RentalRouteAccess } from '@/components/contratos-locacoes/RentalRouteAccess';

export default function ContratosLocacoesLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen bg-slate-50">
      <Toaster position="bottom-center" />
      <ContentContainer>
        <ModulePageContext />

        <RentalRouteAccess>{children}</RentalRouteAccess>
      </ContentContainer>
    </div>
  );
}
