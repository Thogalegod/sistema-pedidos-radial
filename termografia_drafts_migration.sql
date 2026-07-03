ALTER TABLE relatorios_termografia
  ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE relatorios_termografia
  ALTER COLUMN atualizado_em SET DEFAULT NOW();

UPDATE relatorios_termografia
SET atualizado_em = NOW()
WHERE atualizado_em IS NULL;

ALTER TABLE relatorios_termografia
  ALTER COLUMN atualizado_em SET NOT NULL;

CREATE INDEX IF NOT EXISTS relatorios_termografia_criado_por_status_atualizado_em_idx
  ON relatorios_termografia (criado_por, status, atualizado_em DESC);

CREATE UNIQUE INDEX IF NOT EXISTS relatorios_termografia_numero_relatorio_uidx
  ON relatorios_termografia (numero_relatorio);

CREATE OR REPLACE FUNCTION criar_rascunho_termografia()
RETURNS relatorios_termografia
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  usuario_id UUID := auth.uid();
  agora TIMESTAMPTZ := NOW();
  prefixo TEXT := 'RT-' || TO_CHAR(agora, 'YYYYMM') || '-';
  proxima_sequencia INTEGER;
  rascunho relatorios_termografia%ROWTYPE;
BEGIN
  IF usuario_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('relatorios_termografia:' || TO_CHAR(agora, 'YYYYMM'), 0));

  SELECT *
  INTO rascunho
  FROM relatorios_termografia
  WHERE criado_por = usuario_id
    AND status = 'rascunho'
  ORDER BY atualizado_em DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN rascunho;
  END IF;

  SELECT COALESCE(MAX(SUBSTRING(numero_relatorio FROM 11 FOR 3)::INTEGER), 0) + 1
  INTO proxima_sequencia
  FROM relatorios_termografia
  WHERE numero_relatorio LIKE prefixo || '%';

  INSERT INTO relatorios_termografia (
    numero_relatorio, criado_por, cliente_nome, cliente_cnpj, cliente_endereco,
    cliente_cidade, cliente_uf, cliente_cep, data_execucao, objetivo, equipamento,
    responsavel_nome, responsavel_crea, revisao, pontos, status
  ) VALUES (
    prefixo || LPAD(proxima_sequencia::TEXT, 3, '0'), usuario_id, '', '', '', '', 'SP', '',
    agora::DATE, 'Estudo Termográfico da subestação primária e dos painéis elétricos',
    'Flir InfraCAM SD', 'Roberto Fontes Lopes', '0601049229', 0, '[]'::JSONB, 'rascunho'
  )
  RETURNING * INTO rascunho;

  RETURN rascunho;
END;
$$;

CREATE OR REPLACE FUNCTION atualizar_relatorios_termografia_atualizado_em()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS relatorios_termografia_atualizado_em_trigger
  ON relatorios_termografia;

CREATE TRIGGER relatorios_termografia_atualizado_em_trigger
BEFORE UPDATE ON relatorios_termografia
FOR EACH ROW
EXECUTE FUNCTION atualizar_relatorios_termografia_atualizado_em();
