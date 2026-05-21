CREATE TABLE relatorios_termografia (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  numero_relatorio TEXT UNIQUE NOT NULL,
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  criado_por UUID REFERENCES auth.users(id),
  status TEXT DEFAULT 'gerado',

  cliente_nome TEXT NOT NULL,
  cliente_endereco TEXT,
  cliente_cidade TEXT,
  cliente_uf TEXT,
  cliente_cep TEXT,
  cliente_cnpj TEXT,
  data_execucao DATE NOT NULL,
  objetivo TEXT DEFAULT 'Estudo Termográfico da subestação primária e dos painéis elétricos',
  equipamento TEXT DEFAULT 'Flir InfraCAM SD',

  responsavel_nome TEXT DEFAULT 'Roberto Fontes Lopes',
  responsavel_crea TEXT DEFAULT 'CREA 060.104.922.9',
  revisao INTEGER DEFAULT 0,

  pontos JSONB NOT NULL DEFAULT '[]'::jsonb
);

ALTER TABLE relatorios_termografia ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usuarios autenticados termografia select"
  ON relatorios_termografia FOR SELECT USING (auth.uid() = criado_por);
CREATE POLICY "usuarios autenticados termografia insert"
  ON relatorios_termografia FOR INSERT WITH CHECK (auth.uid() = criado_por);
CREATE POLICY "usuarios autenticados termografia update"
  ON relatorios_termografia FOR UPDATE USING (auth.uid() = criado_por);
CREATE POLICY "usuarios autenticados termografia delete"
  ON relatorios_termografia FOR DELETE USING (auth.uid() = criado_por);
