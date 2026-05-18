'use client';

import { useState, useEffect } from 'react';
import { uploadCreaRoberto, getUrlArquivo } from '@/lib/storage';
import { Toaster, toast } from 'react-hot-toast';

export default function ConfiguracoesPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploadando, setUploadando] = useState(false);

  useEffect(() => {
    getUrlArquivo('crea/roberto-fontes-lopes.jpg').then(url => {
      if (url) setPreview(url);
    });
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setPreview(URL.createObjectURL(f));
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploadando(true);
    const res = await uploadCreaRoberto(file);
    if (res) {
      toast.success('Imagem do CREA atualizada com sucesso!');
    } else {
      toast.error('Erro ao atualizar imagem do CREA.');
    }
    setUploadando(false);
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <Toaster position="top-right" />
      <h1 className="text-2xl font-bold mb-6">Configurações do Sistema</h1>

      <div className="bg-white p-6 rounded shadow border">
        <h2 className="text-xl font-semibold mb-4">Imagem do CREA — Roberto Fontes Lopes</h2>
        <div className="flex flex-col gap-4">
          {preview ? (
            <img src={preview} alt="Preview CREA" className="max-w-md border rounded" />
          ) : (
            <div className="w-full max-w-md h-40 bg-gray-100 flex items-center justify-center border-2 border-dashed text-gray-500">
              Nenhuma imagem do CREA cadastrada
            </div>
          )}
          
          <input 
            type="file" 
            accept="image/jpeg, image/png" 
            onChange={handleFileChange}
            className="block w-full text-sm text-slate-500
              file:mr-4 file:py-2 file:px-4
              file:rounded-full file:border-0
              file:text-sm file:font-semibold
              file:bg-blue-50 file:text-blue-700
              hover:file:bg-blue-100"
          />
          <button 
            onClick={handleUpload} 
            disabled={!file || uploadando}
            className="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700 disabled:opacity-50 w-fit"
          >
            {uploadando ? 'Enviando...' : 'Atualizar imagem do CREA'}
          </button>
        </div>
      </div>
    </div>
  );
}
