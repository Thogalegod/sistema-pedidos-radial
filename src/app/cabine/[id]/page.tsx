'use client';

import { useEffect, use } from 'react';
import { useRouter } from 'next/navigation';

export default function CabineReportRedirect(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const router = useRouter();

  useEffect(() => {
    router.replace(`/cabine/${params.id}/imprimir`);
  }, [params.id, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-600">
      Abrindo relatório completo...
    </div>
  );
}
