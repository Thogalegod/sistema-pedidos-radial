'use client';

import { Printer } from 'lucide-react';

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-md font-medium transition-colors"
    >
      <Printer size={20} />
      Imprimir / Gerar PDF
    </button>
  );
}
