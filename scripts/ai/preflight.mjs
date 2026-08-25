#!/usr/bin/env node
/**
 * Preflight deterministico de Git para agentes de IA.
 *
 * Imprime no stdout UM objeto JSON compacto, nesta ordem exata de chaves:
 *   {"root":"...","branch":"...","head":"...","upstream":"...","ahead":0,"behind":0,"dirtyCount":0}
 *
 * Falha (exit != 0, mensagem clara no stderr) quando:
 *  - o cwd nao esta dentro de um repositorio git;
 *  - o branch atual nao tem upstream configurado;
 *  - o branch divergiu do upstream (ahead > 0 E behind > 0).
 *
 * `git fetch` roda SOMENTE quando o caller passa `--fetch` explicitamente.
 * Arquivos modificados/untracked NAO causam falha: dirtyCount e informativo.
 * O script jamais muta arquivos ou branches: todas as chamadas usam
 * execFileSync('git', ...) com subcomandos de leitura (o unico efeito
 * colateral possivel e o `git fetch` opt-in, que nao toca a working tree).
 *
 * ahead/behind vem de `git rev-list --left-right --count <upstream>...HEAD`:
 * `A...B` conta left = commits so em A e right = commits so em B, logo a
 * primeira coluna e o behind (so no upstream) e a segunda e o ahead (so no
 * HEAD local).
 *
 * Node puro, sem dependencias externas e sem acesso a rede (por padrao).
 */

import { execFileSync } from 'node:child_process';

const FETCH_FLAG = '--fetch';

function fatal(message, err) {
  let detail = '';
  if (err) {
    const parts = [
      Buffer.isBuffer(err.stdout) ? err.stdout.toString('utf8').trim() : '',
      Buffer.isBuffer(err.stderr) ? err.stderr.toString('utf8').trim() : '',
      typeof err.message === 'string' ? err.message : '',
    ];
    detail = parts.filter(Boolean).join(' | ');
  }
  process.stderr.write(`preflight: ${message}${detail ? ` (${detail})` : ''}\n`);
  process.exit(1);
}

/** Executa `git <args>` via execFileSync e devolve o stdout sem bordas. */
function runGit(args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function main() {
  const shouldFetch = process.argv.slice(2).includes(FETCH_FLAG);

  let root;
  try {
    root = runGit(['rev-parse', '--show-toplevel']);
  } catch (err) {
    fatal('o diretorio atual nao esta dentro de um repositorio git', err);
    return;
  }

  let branch;
  try {
    branch = runGit(['rev-parse', '--abbrev-ref', 'HEAD']);
  } catch (err) {
    fatal('nao foi possivel determinar o branch atual (sem HEAD commitada?)', err);
    return;
  }

  let head;
  try {
    head = runGit(['rev-parse', 'HEAD']);
  } catch (err) {
    fatal('nao foi possivel determinar o HEAD atual', err);
    return;
  }

  let upstream;
  try {
    upstream = runGit(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  } catch (err) {
    fatal(`o branch "${branch}" nao tem upstream configurado`, err);
    return;
  }

  if (shouldFetch) {
    try {
      execFileSync('git', ['fetch', '--quiet'], { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      fatal(`git fetch falhou para o upstream "${upstream}"`, err);
      return;
    }
  }

  let counts;
  try {
    counts = runGit(['rev-list', '--left-right', '--count', `${upstream}...HEAD`]);
  } catch (err) {
    fatal(`nao foi possivel contar ahead/behind contra "${upstream}"`, err);
    return;
  }
  const columns = counts.split(/\s+/);
  const behind = Number.parseInt(columns[0], 10);
  const ahead = Number.parseInt(columns[1], 10);
  if (!Number.isInteger(behind) || !Number.isInteger(ahead)) {
    fatal(`saida inesperada de rev-list --left-right --count: "${counts}"`);
    return;
  }

  if (ahead > 0 && behind > 0) {
    fatal(
      `o branch "${branch}" divergiu de "${upstream}" (ahead ${ahead}, behind ${behind}); sincronize antes de continuar`,
    );
    return;
  }

  let porcelain;
  try {
    porcelain = execFileSync('git', ['status', '--porcelain'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    fatal('nao foi possivel ler o git status', err);
    return;
  }
  const dirtyCount = porcelain.split(/\r?\n/).filter((line) => line !== '').length;

  const payload = { root, branch, head, upstream, ahead, behind, dirtyCount };
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

main();
