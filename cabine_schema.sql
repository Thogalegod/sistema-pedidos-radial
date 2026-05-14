CREATE TABLE relatorios_cabine (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  numero_relatorio TEXT UNIQUE NOT NULL,
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  criado_por UUID REFERENCES auth.users(id),
  status TEXT DEFAULT 'gerado',

  -- Dados do cliente
  cliente_nome TEXT NOT NULL,
  cliente_endereco TEXT NOT NULL,
  cliente_cidade TEXT NOT NULL,
  cliente_uf TEXT NOT NULL,
  cliente_cep TEXT,
  cliente_cnpj TEXT,
  cliente_ie TEXT,
  data_execucao DATE NOT NULL,
  objetivo TEXT DEFAULT 'Relatório de testes Cabine Primária',

  -- Dados do cabo (compartilhado entre HIPOT e Megger)
  cabo_de TEXT NOT NULL,
  cabo_para TEXT NOT NULL,
  cabo_tipo TEXT DEFAULT 'Cabo',
  cabo_fabricacao TEXT,
  cabo_modelo TEXT DEFAULT 'EPR 8,7/15kV',
  cabo_classe_tensao TEXT DEFAULT '15kV',
  cabo_comprimento TEXT NOT NULL,
  cabo_bitola TEXT NOT NULL,
  cabo_terminais TEXT DEFAULT 'Polimérica',
  cabo_temperatura NUMERIC,
  cabo_umidade NUMERIC,
  cabo_clima TEXT DEFAULT 'Bom',

  -- HIPOT
  hipot_tensao_teste TEXT DEFAULT '35kV',
  hipot_duracao TEXT DEFAULT '15 min',
  hipot_instrumento TEXT,
  hipot_serie_instrumento TEXT,

  -- Megger
  megger_tensao_teste TEXT DEFAULT '10kV',
  megger_duracao TEXT DEFAULT '15 min',
  megger_instrumento TEXT,
  megger_serie_instrumento TEXT,

  -- Aterramento
  aterramento_qtde_hastes INTEGER NOT NULL,
  aterramento_tipo TEXT DEFAULT 'Cobre',
  aterramento_classe_tensao TEXT DEFAULT '15kV',
  aterramento_comprimento TEXT,
  aterramento_bitola TEXT DEFAULT '25mm²',
  aterramento_instrumento TEXT,
  aterramento_serie_instrumento TEXT,
  aterramento_temperatura NUMERIC,
  aterramento_umidade NUMERIC,
  aterramento_clima TEXT DEFAULT 'Bom',

  -- ART
  art_numero TEXT,
  art_arquivo_url TEXT,

  -- Responsável
  responsavel_nome TEXT DEFAULT 'Roberto Fontes Lopes',
  responsavel_crea TEXT DEFAULT 'CREA 060.104.922.9',

  -- Valores calculados e fixados
  valores_calculados JSONB NOT NULL
);

ALTER TABLE relatorios_cabine ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usuarios autenticados cabine select"
  ON relatorios_cabine FOR SELECT USING (auth.uid() = criado_por);
CREATE POLICY "usuarios autenticados cabine insert"
  ON relatorios_cabine FOR INSERT WITH CHECK (auth.uid() = criado_por);
CREATE POLICY "usuarios autenticados cabine update"
  ON relatorios_cabine FOR UPDATE USING (auth.uid() = criado_por);
CREATE POLICY "usuarios autenticados cabine delete"
  ON relatorios_cabine FOR DELETE USING (auth.uid() = criado_por);
