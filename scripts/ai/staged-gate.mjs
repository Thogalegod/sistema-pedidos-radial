#!/usr/bin/env node
/**
 * Gate deterministico do index (staged) para agentes de IA.
 *
 * Avalia SOMENTE o que ja esta staged (nunca faz stage/unstage por conta
 * propria) e falha com exit != 0 e mensagem no stderr quando:
 *
 *  1. nao existe nenhum caminho staged;
 *  2. algum caminho staged bate em padrao proibido:
 *     - `.env*` EXCETO `.env.example`;
 *     - `.claude/settings.local.json`;
 *     - `CLAUDE.local.md`;
 *     - `.next/`, `.next-bloqueada-*`, `playwright-report/`, `test-results/`,
 *       `pw-report-*`, `pw-results-*` (em qualquer nivel do caminho);
 *     - `*.pem`.
 *  3. `git diff --cached --check` acusa erro de whitespace (exit nonzero);
 *  4. alguma linha ADICIONADA do diff staged contem marcador obvio de segredo
 *     (cabecalho de chave privada PEM, credenciais de servico das APIs do
 *     projeto ou prefixo de token de servico do Supabase; lista exata em
 *     SECRET_MARKERS).
 *
 * No sucesso imprime a lista exata dos arquivos staged (um por linha) e por
 * ultimo a linha STAGED_GATE_PASS.
 *
 * Node puro, sem dependencias externas e sem acesso a rede.
 */

import { execFileSync } from 'node:child_process';

/**
 * Marcadores construidos por concatenacao de fragmentos para que os fontes do
 * proprio gate (e de seus testes) nao contenham os literais completos: o gate
 * escaneia linhas adicionadas e bloquearia a propria manuntencao. A semantica
 * de deteccao permanece substring simples, case-insensitive.
 */
const SECRET_MARKERS = [
  ['BEGIN', ' ', 'PRIVATE', ' ', 'KEY'].join(''),
  ['SUPABASE', '_SERVICE', '_ROLE', '_KEY'].join(''),
  ['ANTHROPIC', '_API', '_KEY'].join(''),
  ['OPENAI', '_API', '_KEY'].join(''),
  ['ZAI', '_API', '_KEY'].join(''),
  ['sb_', 'secret', '_'].join(''),
];

/** Diretorios proibidos por prefixo, em qualquer segmento do caminho. */
const FORBIDDEN_DIR_PREFIXES = ['.next-bloqueada-', 'pw-report-', 'pw-results-'];

/** Diretorios proibidos por nome exato, em qualquer segmento do caminho. */
const FORBIDDEN_DIR_EXACT = new Set(['.next', 'playwright-report', 'test-results']);

function fail(message) {
  process.stderr.write(`staged-gate: ${message}\n`);
  process.exit(1);
}

/** Executa `git <args>` via execFileSync e devolve o stdout puro (sem trim). */
function runGitRaw(args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function errOutput(err) {
  const parts = [
    Buffer.isBuffer(err.stdout) ? err.stdout.toString('utf8') : '',
    Buffer.isBuffer(err.stderr) ? err.stderr.toString('utf8') : '',
  ];
  return parts.filter((part) => part.trim() !== '').join('\n');
}

/** Normaliza separadores para `/` (git ja usa `/`, isso e defesa extra). */
function toPosix(filePath) {
  return filePath.replace(/\\/g, '/');
}

/**
 * Devolve o motivo da rejeicao do caminho staged, ou null se for permitido.
 * A regra de `.env*` e de `*.pem`/`CLAUDE.local.md` olha o basename; as
 * regras de diretorio olham qualquer segmento do caminho.
 */
function forbiddenPathReason(rawPath) {
  const p = toPosix(rawPath);
  if (p === '') return null;
  const segments = p.split('/');
  const base = segments[segments.length - 1];

  if (base === '.env' || base.startsWith('.env.')) {
    if (base !== '.env.example') {
      return `"${p}" e um arquivo .env (somente .env.example e permitido como template)`;
    }
  }
  if (base.endsWith('.pem')) {
    return `"${p}" e um certificado/chave privada (*.pem)`;
  }
  if (base === 'CLAUDE.local.md') {
    return `"${p}" e configuracao local de agente (CLAUDE.local.md)`;
  }
  if (p === '.claude/settings.local.json' || p.endsWith('/.claude/settings.local.json')) {
    return `"${p}" e configuracao local de agente (.claude/settings.local.json)`;
  }
  for (const segment of segments.slice(0, -1)) {
    if (FORBIDDEN_DIR_EXACT.has(segment)) {
      return `"${p}" esta dentro do diretorio "${segment}/"`;
    }
  }
  for (const segment of segments) {
    for (const prefix of FORBIDDEN_DIR_PREFIXES) {
      if (segment.startsWith(prefix)) {
        return `"${p}" referencia o diretorio "${prefix}*"`;
      }
    }
  }
  return null;
}

function main() {
  let namesRaw;
  try {
    namesRaw = runGitRaw(['diff', '--cached', '--name-only', '-z']);
  } catch (err) {
    fail(`nao foi possivel listar os caminhos staged${errOutput(err) ? `:\n${errOutput(err)}` : ''}`);
    return;
  }
  const staged = namesRaw.split('\0').filter((name) => name !== '');
  if (staged.length === 0) {
    fail('nenhum caminho staged; faca stage de caminhos explicitos antes de rodar o gate');
    return;
  }

  const pathViolations = [];
  for (const stagedPath of staged) {
    const reason = forbiddenPathReason(stagedPath);
    if (reason !== null) {
      pathViolations.push(reason);
    }
  }
  if (pathViolations.length > 0) {
    fail(`caminhos staged proibidos:\n  - ${pathViolations.join('\n  - ')}`);
    return;
  }

  try {
    runGitRaw(['diff', '--cached', '--check']);
  } catch (err) {
    const output = errOutput(err);
    fail(`git diff --cached --check acusou problemas de whitespace${output ? `:\n${output}` : ''}`);
    return;
  }

  let diff;
  try {
    diff = runGitRaw(['diff', '--cached', '--no-ext-diff', '--unified=0']);
  } catch (err) {
    fail(`nao foi possivel ler o diff staged${errOutput(err) ? `:\n${errOutput(err)}` : ''}`);
    return;
  }
  for (const line of diff.split('\n')) {
    if (!line.startsWith('+') || line.startsWith('+++')) continue;
    const added = line.slice(1);
    for (const marker of SECRET_MARKERS) {
      if (added.toLowerCase().includes(marker.toLowerCase())) {
        fail(
          `linha adicionada no diff staged contem marcador de segredo "${marker}": ${added.trim().slice(0, 120)}`,
        );
        return;
      }
    }
  }

  for (const stagedPath of staged) {
    process.stdout.write(`${stagedPath}\n`);
  }
  process.stdout.write('STAGED_GATE_PASS\n');
}

main();
