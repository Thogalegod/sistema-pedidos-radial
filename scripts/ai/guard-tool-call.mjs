#!/usr/bin/env node
/**
 * Claude Code PreToolUse guard (fail-closed).
 *
 * Le um payload JSON de tool call pelo stdin e imprime, quando preciso,
 * a decisao de bloqueio no formato { "decision": "block", "reason": "..." }.
 *
 * Bloqueia:
 *  - qualquer comando que referencie o project ref de producao;
 *  - git destrutivo (add . / add -A / reset / clean / stash / rebase /
 *    checkout -- / restore);
 *  - comandos `supabase` quando o ref do projeto apontar para producao;
 *  - Write/Edit em arquivos de segredo (.env, .env.*, *.pem), exceto .env.example.
 *
 * Regras de saida:
 *  - bloqueio: imprime o JSON de block no stdout e sai com codigo 0;
 *  - liberacao: nao imprime nada e sai com codigo 0;
 *  - entrada invalida: fail-closed (bloqueia) e sai com codigo 0.
 *
 * Node puro, sem dependencias externas e sem acesso a rede.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PRODUCTION_PROJECT_REF = 'misfyiznwnuvldoccciw';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');

/**
 * Padroes git destrutivos aplicados ao campo `command` (Bash/PowerShell).
 * `git status --short` e `git add <arquivos>` continuam permitidos.
 */
const DESTRUCTIVE_GIT_PATTERNS = [
  [/\bgit\s+add\s+(?:\.|-a\b|--all\b)/i, 'git add de escopo amplo (ex.: "git add ." ou "git add -A") e proibido; adicione caminhos explicitos.'],
  [/\bgit\s+reset\b/i, '"git reset" e proibido em qualquer forma (com ou sem --hard).'],
  [/\bgit\s+clean\b/i, '"git clean" e proibido.'],
  [/\bgit\s+stash\b/i, '"git stash" e proibido.'],
  [/\bgit\s+rebase\b/i, '"git rebase" e proibido.'],
  [/\bgit\s+checkout\s+(?:--|\.(?:\s|$))/i, '"git checkout -- <caminho>" / "git checkout ." descarta mudancas e e proibido.'],
  [/\bgit\s+restore\b/i, '"git restore" descarta mudancas de caminhos e e proibido.'],
];

function emitBlock(reason) {
  process.stdout.write(`${JSON.stringify({ decision: 'block', reason })}\n`);
  process.exit(0);
}

function readStdinFully() {
  return new Promise((resolve, reject) => {
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      raw += chunk;
    });
    process.stdin.on('end', () => resolve(raw));
    process.stdin.on('error', reject);
    process.stdin.resume();
  });
}

/**
 * O ref de producao pode estar configurado em supabase/.temp/project-ref.
 * Considera o repositorio do script e o cwd do hook como raizes possiveis.
 */
function localProjectRefIsProduction() {
  const candidates = [
    path.join(repoRoot, 'supabase', '.temp', 'project-ref'),
    path.join(process.cwd(), 'supabase', '.temp', 'project-ref'),
  ];
  for (const candidate of candidates) {
    try {
      if (fs.readFileSync(candidate, 'utf8').trim() === PRODUCTION_PROJECT_REF) {
        return true;
      }
    } catch {
      /* arquivo ausente ou ilegivel: ignora */
    }
  }
  return false;
}

/**
 * Bloqueia .env, .env.* e *.pem, exceto .env.example.
 */
function isForbiddenSecretPath(filePath) {
  if (typeof filePath !== 'string' || filePath === '') return false;
  const base = filePath.split(/[\\/]/).pop().toLowerCase();
  if (base === '.env.example') return false;
  if (base === '.env' || base.startsWith('.env.')) return true;
  if (base.endsWith('.pem')) return true;
  return false;
}

function evaluateCommand(command) {
  if (command.toLowerCase().includes(PRODUCTION_PROJECT_REF)) {
    return `Comando referencia o project ref de producao (${PRODUCTION_PROJECT_REF}); ambientes remotos de producao sao intocaveis.`;
  }
  for (const [pattern, reason] of DESTRUCTIVE_GIT_PATTERNS) {
    if (pattern.test(command)) {
      return reason;
    }
  }
  if (/\bsupabase\b/i.test(command) && localProjectRefIsProduction()) {
    return 'Comando "supabase" detectado enquanto supabase/.temp/project-ref aponta para o ref de producao.';
  }
  return null;
}

async function main() {
  let raw;
  try {
    raw = await readStdinFully();
  } catch (err) {
    emitBlock(`Hook de seguranca falhou ao ler a entrada (${err?.message ?? err}); bloqueando por fail-closed.`);
    return;
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    emitBlock('Entrada do hook de seguranca invalida (JSON nao parseavel); bloqueando por fail-closed.');
    return;
  }

  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    emitBlock('Entrada do hook de seguranca invalida (payload nao e um objeto de tool call); bloqueando por fail-closed.');
    return;
  }

  const toolName = typeof payload.tool_name === 'string' ? payload.tool_name.toLowerCase() : '';
  const toolInput =
    payload.tool_input !== null &&
    typeof payload.tool_input === 'object' &&
    !Array.isArray(payload.tool_input)
      ? payload.tool_input
      : {};
  const command = typeof toolInput.command === 'string' ? toolInput.command : '';
  const filePath = typeof toolInput.file_path === 'string' ? toolInput.file_path : '';

  if (command !== '') {
    const commandReason = evaluateCommand(command);
    if (commandReason) {
      emitBlock(commandReason);
      return;
    }
  }

  if ((toolName === 'write' || toolName === 'edit') && isForbiddenSecretPath(filePath)) {
    emitBlock(`Escrita em arquivo de segredo nao permitida: ${filePath} (permitido apenas .env.example como template).`);
    return;
  }

  /* Sem bloqueio: nao imprime nada e sai com codigo 0. */
}

main().catch((err) => {
  emitBlock(`Hook de seguranca falhou inesperadamente (${err?.message ?? err}); bloqueando por fail-closed.`);
});
