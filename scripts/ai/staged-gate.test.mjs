import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const gateScript = path.join(repoRoot, 'scripts', 'ai', 'staged-gate.mjs');
const TIMEOUT_MS = 15000;

/**
 * Executa `git <args>` com cwd no repositorio temporario e devolve stdout
 * sem bordas. Repositorios temporarios vivem sob os.tmpdir() e sao
 * descartaveis: aqui git init/config/add/commit sao permitidos.
 */
function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

/** Cria um repositorio git NOVO com um commit baseline para servir de HEAD. */
function makeTempRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'staged-gate-'));
  git(dir, ['init', '--quiet', '--initial-branch=main']);
  git(dir, ['config', 'user.email', 'staged-gate@example.invalid']);
  git(dir, ['config', 'user.name', 'Staged Gate Test']);
  git(dir, ['config', 'commit.gpgsign', 'false']);
  git(dir, ['config', 'core.autocrlf', 'false']);
  fs.writeFileSync(path.join(dir, 'baseline.txt'), 'baseline\n');
  git(dir, ['add', 'baseline.txt']);
  git(dir, ['commit', '--quiet', '-m', 'baseline']);
  return dir;
}

/** Escreve arquivos no repo temporario e faz stage com caminhos explicitos. */
function stageFiles(repoDir, files) {
  for (const file of files) {
    const abs = path.join(repoDir, file.path);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, file.content);
    git(repoDir, ['add', file.path]);
  }
}

/** Spawns `node scripts/ai/staged-gate.mjs` com cwd no repo temporario. */
function runGate(cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [gateScript], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
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
  });
}

/** Executa `fn` com um repo temporario fresco e remove o repo ao final. */
async function withTempRepo(fn) {
  const repoDir = makeTempRepo();
  try {
    return await fn(repoDir);
  } finally {
    fs.rmSync(repoDir, { recursive: true, force: true });
  }
}

const passCases = [
  {
    name: 'arquivo .ts comum staged',
    files: [{ path: 'src/utils/format.ts', content: 'export function format(v: string): string {\n  return v.trim();\n}\n' }],
  },
  {
    name: '.env.example staged (excecao permitida de .env*)',
    files: [{ path: '.env.example', content: 'NEXT_PUBLIC_APP_URL=http://localhost:3000\n' }],
  },
];

/**
 * Literais dos marcadores de segredo montados por concatenacao para que o
 * fonte deste teste nao contenha os literais completos (o staged-gate escaneia
 * linhas adicionadas e bloquearia a manuntencao dos proprios scripts de IA).
 */
const PRIVATE_KEY_MARKER = ['BEGIN', ' ', 'PRIVATE', ' ', 'KEY'].join('');
const SERVICE_ROLE_MARKER = ['SUPABASE', '_SERVICE', '_ROLE', '_KEY'].join('');

const failCases = [
  {
    name: '.env.local staged',
    files: [{ path: '.env.local', content: 'NEXT_PUBLIC_APP_URL=http://localhost:3000\n' }],
  },
  {
    name: 'pw-report-x/index.html staged',
    files: [{ path: 'pw-report-x/index.html', content: '<html><body>report</body></html>\n' }],
  },
  {
    name: '.next/cache/x staged',
    files: [{ path: '.next/cache/trace', content: 'trace-data\n' }],
  },
  {
    name: '.claude/settings.local.json staged',
    files: [{ path: '.claude/settings.local.json', content: '{"permissions":{}}\n' }],
  },
  {
    name: `diff staged com linha adicionada ${PRIVATE_KEY_MARKER}`,
    files: [
      { path: 'src/keys/private.ts', content: `const key = \`-----${PRIVATE_KEY_MARKER}-----\`;\n` },
    ],
  },
  {
    name: `diff staged com linha adicionada ${SERVICE_ROLE_MARKER}=`,
    files: [{ path: 'src/config/env.ts', content: `${SERVICE_ROLE_MARKER}=eyJhbGciOi\n` }],
  },
  {
    name: 'erro de whitespace acusado por git diff --cached --check',
    files: [{ path: 'src/utils/ws.ts', content: 'export const b = 2; \n' }],
  },
  {
    name: 'certificado *.pem staged',
    files: [{ path: 'certs/server.pem', content: '-----BEGIN CERTIFICATE-----\nabc\n' }],
  },
  {
    name: 'diretorio .next-bloqueada-* staged',
    files: [{ path: '.next-bloqueada-20260804/build.log', content: 'build\n' }],
  },
];

for (const testCase of passCases) {
  test(`passa: ${testCase.name}`, async () => {
    await withTempRepo(async (repoDir) => {
      stageFiles(repoDir, testCase.files);
      const { code, stdout, stderr } = await runGate(repoDir);

      assert.equal(
        code,
        0,
        `exit code esperado 0 (obtido ${code})${stderr ? `; stderr: ${stderr}` : ''}`,
      );

      const lines = stdout.split(/\r?\n/).filter((line) => line !== '');
      assert.ok(
        stdout.includes('STAGED_GATE_PASS'),
        `stdout deveria conter STAGED_GATE_PASS; obtido: ${stdout}`,
      );
      assert.equal(lines[lines.length - 1], 'STAGED_GATE_PASS', `STAGED_GATE_PASS deveria ser a ultima linha; obtido: ${stdout}`);
      for (const file of testCase.files) {
        assert.ok(
          lines.includes(file.path),
          `stdout deveria listar exatamente o caminho staged "${file.path}"; obtido: ${stdout}`,
        );
      }
    });
  });
}

for (const testCase of failCases) {
  test(`falha: ${testCase.name}`, async () => {
    await withTempRepo(async (repoDir) => {
      stageFiles(repoDir, testCase.files);
      const { code, stdout, stderr } = await runGate(repoDir);

      assert.notEqual(code, 0, `exit code deveria ser != 0; stdout: ${stdout}`);
      assert.notEqual(
        stderr.trim(),
        '',
        'stderr deveria conter a mensagem de rejeicao do gate',
      );
      assert.ok(
        !stdout.includes('STAGED_GATE_PASS'),
        `stdout nao deveria conter STAGED_GATE_PASS; obtido: ${stdout}`,
      );
    });
  });
}

test('falha: nada staged (exige ao menos um caminho staged)', async () => {
  await withTempRepo(async (repoDir) => {
    fs.writeFileSync(path.join(repoDir, 'untracked.ts'), 'export const u = 1;\n');
    const { code, stdout, stderr } = await runGate(repoDir);

    assert.notEqual(code, 0, `exit code deveria ser != 0; stdout: ${stdout}`);
    assert.notEqual(stderr.trim(), '', 'stderr deveria conter a mensagem de rejeicao do gate');
    assert.ok(
      !stdout.includes('STAGED_GATE_PASS'),
      `stdout nao deveria conter STAGED_GATE_PASS; obtido: ${stdout}`,
    );
  });
});
