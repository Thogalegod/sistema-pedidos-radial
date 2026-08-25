import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const notifyScript = path.join(repoRoot, 'scripts', 'ai', 'notify-windows.ps1');
const TIMEOUT_MS = 20000;

/**
 * Textos FIXOS esperados por kind (devem permanecer estaticos: nada de
 * caminhos, comandos ou conteudo de tarefa nas notificacoes).
 */
const EXPECTED = new Map([
  ['stop', 'aguardando'],
  ['permission', 'aprova'],
  ['failure', 'erro'],
  ['test', 'teste'],
]);

/** Spawna powershell.exe com o script de notificacao em modo DryRun. */
function runNotify(kind, extraArgs = []) {
  const args = [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-WindowStyle',
    'Hidden',
    '-File',
    notifyScript,
    '-Kind',
    kind,
    ...extraArgs,
  ];
  return spawnSync('powershell.exe', args, {
    encoding: 'utf8',
    timeout: TIMEOUT_MS,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

test('dry-run: cada kind valida e reporta titulo/texto fixos', () => {
  for (const [kind, marker] of EXPECTED) {
    const res = runNotify(kind, ['-DryRun']);
    assert.equal(res.status, 0, `kind "${kind}" deveria exit 0; stderr: ${res.stderr}`);
    assert.ok(
      res.stdout.includes('NOTIFY_DRYRUN'),
      `kind "${kind}" deveria imprimir NOTIFY_DRYRUN; stdout: ${res.stdout}`,
    );
    assert.ok(
      res.stdout.toLowerCase().includes(marker),
      `kind "${kind}" deveria conter o marcador "${marker}" no texto; stdout: ${res.stdout}`,
    );
    assert.ok(
      res.stdout.includes('Claude Code'),
      `kind "${kind}" deveria usar o titulo "Claude Code"; stdout: ${res.stdout}`,
    );
  }
});

test('dry-run: kind invalido e rejeitado com exit != 0', () => {
  const res = runNotify('hackula');
  assert.notEqual(res.status, 0, 'kind invalido deveria falhar o binding de parametro');
});

test('script nao le stdin nem insere conteudo dinamico no toast', () => {
  const source = fs.readFileSync(notifyScript, 'utf8');
  assert.ok(!source.includes('[Console]::In'), 'script nao deveria ler stdin');
  assert.ok(!source.includes('$args[0]'), 'script nao deveria usar args posicionais');
});

test('settings.json: hooks de notificacao presentes e guard intacto', () => {
  const settings = JSON.parse(fs.readFileSync(path.join(repoRoot, '.claude', 'settings.json'), 'utf8'));
  const hooks = settings.hooks;

  // Guard PreToolUse existente permanece apontando para o guard-tool-call.mjs.
  const pre = hooks.PreToolUse ?? [];
  const guardOk = pre.some((entry) =>
    (entry.hooks ?? []).some(
      (h) =>
        typeof h.command === 'string' &&
        h.command.endsWith('node') &&
        (h.args ?? []).some((a) => String(a).includes('guard-tool-call.mjs')),
    ),
  );
  assert.ok(guardOk, 'hook PreToolUse do guard deveria continuar presente');

  // Stop e StopFailure sem matcher (todos os casos), chamando o notify.
  const callsNotify = (entries) =>
    (entries ?? []).some((entry) =>
      (entry.hooks ?? []).some(
        (h) => (h.args ?? []).some((a) => String(a).includes('notify-windows.ps1')),
      ),
    );
  assert.ok(callsNotify(hooks.Stop), 'hook Stop deveria chamar notify-windows.ps1');
  assert.ok(callsNotify(hooks.StopFailure), 'hook StopFailure deveria chamar notify-windows.ps1');
  // Stop e StopFailure devem cobrir TODOS os casos (sem matcher restritivo).
  for (const [eventName, entries] of [['Stop', hooks.Stop], ['StopFailure', hooks.StopFailure]]) {
    for (const entry of entries ?? []) {
      assert.equal(
        entry.matcher,
        undefined,
        `entradas de ${eventName} nao deveriam ter matcher (deve valer para todos os casos)`,
      );
    }
  }

  // Notification SOMENTE para permission_prompt (sem idle_prompt etc.).
  const notif = hooks.Notification ?? [];
  assert.ok(
    notif.some((entry) => entry.matcher === 'permission_prompt' && callsNotify([entry])),
    'hook Notification deveria ter matcher permission_prompt chamando notify-windows.ps1',
  );
  assert.ok(
    !notif.some((entry) => entry.matcher === 'idle_prompt'),
    'matcher idle_prompt nao deveria ser usado (ruido desnecessario)',
  );
});
