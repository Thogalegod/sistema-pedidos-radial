import { Toaster } from 'react-hot-toast';
import { ModulePageContext } from '@/components/contratos-locacoes/ModulePageContext';

export default function ContratosLocacoesLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster position="bottom-center" />
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
        <ModulePageContext />

        {children}
      </div>
    </div>
  );
}
