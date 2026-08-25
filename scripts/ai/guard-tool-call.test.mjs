import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const guardScript = path.join(repoRoot, 'scripts', 'ai', 'guard-tool-call.mjs');
const TIMEOUT_MS = 15000;

/**
 * Spawns `node scripts/ai/guard-tool-call.mjs` with cwd no repositorio,
 * alimenta `stdinPayload` pelo stdin e coleta stdout/stderr/exit code.
 */
function runGuard(stdinPayload) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [guardScript], {
      cwd: repoRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });

    child.stdin.on('error', () => {
      /* stdin fechado antes do write é tratado como fim da entrada */
    });
    child.stdin.end(stdinPayload);
  });
}

/** stdout vazio -> null; caso contrario parseia como JSON. */
function parseStdout(stdout) {
  const trimmed = stdout.trim();
  if (trimmed === '') return null;
  return JSON.parse(trimmed);
}

const forbidden = [
  { tool_name: 'PowerShell', tool_input: { command: 'git add .' } },
  { tool_name: 'Bash', tool_input: { command: 'git add -A' } },
  { tool_name: 'PowerShell', tool_input: { command: 'git reset --hard HEAD~1' } },
  { tool_name: 'PowerShell', tool_input: { command: 'git clean -fd' } },
  { tool_name: 'Bash', tool_input: { command: 'git stash' } },
  { tool_name: 'Bash', tool_input: { command: 'git rebase origin/main' } },
  { tool_name: 'Bash', tool_input: { command: 'npx supabase db push --project-ref misfyiznwnuvldoccciw' } },
  { tool_name: 'Write', tool_input: { file_path: 'C:\\repo\\.env.local', content: 'SECRET=x' } },
  { tool_name: 'Edit', tool_input: { file_path: 'C:\\repo\\.env.production', old_string: 'a', new_string: 'b' } },
];

const allowed = [
  { tool_name: 'PowerShell', tool_input: { command: 'git status --short' } },
  { tool_name: 'PowerShell', tool_input: { command: 'git add AGENTS.md CLAUDE.md' } },
  { tool_name: 'Bash', tool_input: { command: 'npx tsc --noEmit --pretty false' } },
  { tool_name: 'Write', tool_input: { file_path: 'C:\\repo\\.env.example', content: 'NEXT_PUBLIC_X=' } },
  { tool_name: 'Edit', tool_input: { file_path: 'C:\\repo\\src\\x.ts', old_string: 'a', new_string: 'b' } },
];

function describePayload(payload) {
  const input = payload.tool_input ?? {};
  const detail = input.command ?? input.file_path ?? JSON.stringify(input);
  return `${payload.tool_name}: ${detail}`;
}

for (const payload of forbidden) {
  test(`bloqueia: ${describePayload(payload)}`, async () => {
    const { code, stdout, stderr } = await runGuard(JSON.stringify(payload));

    assert.equal(
      code,
      0,
      `exit code esperado 0 (obtido ${code})${stderr ? `; stderr: ${stderr}` : ''}`,
    );

    let parsed;
    assert.doesNotThrow(() => {
      parsed = parseStdout(stdout);
    }, `stdout deveria ser JSON valido ou vazio; obtido: ${stdout}`);

    assert.ok(parsed, `esperado JSON de block no stdout; obtido: ${stdout}`);
    assert.equal(parsed.decision, 'block', `decision deveria ser "block"; stdout: ${stdout}`);
    assert.equal(
      typeof parsed.reason,
      'string',
      `reason deveria ser string; stdout: ${stdout}`,
    );
    assert.notEqual(parsed.reason.trim(), '', `reason nao deveria ser vazio; stdout: ${stdout}`);
  });
}

for (const payload of allowed) {
  test(`permite: ${describePayload(payload)}`, async () => {
    const { code, stdout, stderr } = await runGuard(JSON.stringify(payload));

    assert.equal(
      code,
      0,
      `exit code esperado 0 (obtido ${code})${stderr ? `; stderr: ${stderr}` : ''}`,
    );

    const trimmed = stdout.trim();
    let parsed = null;
    if (trimmed !== '') {
      assert.doesNotThrow(() => {
        parsed = parseStdout(stdout);
      }, `stdout nao-vazio deveria ser JSON valido; obtido: ${stdout}`);
    }

    assert.ok(
      parsed === null || parsed.decision !== 'block',
      `comando permitido nao deveria ser bloqueado; stdout: ${stdout}`,
    );
  });
}

test('fail-closed: stdin com JSON invalido tambem bloqueia', async () => {
  const { code, stdout, stderr } = await runGuard('not-json{');

  assert.equal(
    code,
    0,
    `exit code esperado 0 (obtido ${code})${stderr ? `; stderr: ${stderr}` : ''}`,
  );

  const parsed = parseStdout(stdout);
  assert.ok(parsed, `esperado JSON de block no stdout; obtido: ${stdout}`);
  assert.equal(parsed.decision, 'block', `decision deveria ser "block"; stdout: ${stdout}`);
  assert.equal(typeof parsed.reason, 'string', `reason deveria ser string; stdout: ${stdout}`);
  assert.notEqual(parsed.reason.trim(), '', `reason nao deveria ser vazio; stdout: ${stdout}`);
});
