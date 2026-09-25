// Local-only: fixed disposable Docker container, no URL/credentials/remote flags.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

const container = 'supabase_db_radial-pedidos-v1-gate05';
const templateContainer = process.env.SUPABASE_TEMPLATE_DB_CONTAINER
  ?? 'supabase_db_Sistema_Pedidos_Radial-unificar-transfor';
const root = new URL('../../', import.meta.url);
const org = '05000001-0000-4000-8000-000000000001';
const order = '05000002-0000-4000-8000-000000000001';
const taskA = '05000003-0000-4000-8000-000000000001';
const taskC = '05000003-0000-4000-8000-000000000004';
const actor = '05000000-0000-4000-8000-000000000002';
const auth = `SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${actor}',true);`;
const templateActor = '11000000-0000-4000-8000-000000000001';
const templateOrg = '11000001-0000-4000-8000-000000000001';
const templateId = '11000002-0000-4000-8000-000000000001';
const templateRequest = '11000009-0000-4000-8000-000000000001';
const templateAuth = `SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${templateActor}',true);`;

function docker(args, input = '') {
  return new Promise((resolve, reject) => {
    const command = process.platform === 'win32' ? 'wsl.exe' : 'docker';
    const argv = process.platform === 'win32' ? ['-d', 'Ubuntu-22.04', '--', 'docker', ...args] : args;
    const child = spawn(command, argv, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.setEncoding('utf8').on('data', data => { stdout += data; });
    child.stderr.setEncoding('utf8').on('data', data => { stderr += data; });
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() }));
    child.stdin.on('error', error => { if (error.code !== 'EPIPE') reject(error); });
    child.stdin.end(input);
  });
}

function templateDocker(args, input = '') {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.setEncoding('utf8').on('data', data => { stdout += data; });
    child.stderr.setEncoding('utf8').on('data', data => { stderr += data; });
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() }));
    child.stdin.on('error', error => { if (error.code !== 'EPIPE') reject(error); });
    child.stdin.end(input);
  });
}

function templateQuery(sql) {
  return templateDocker(['exec', '-i', templateContainer, 'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'], sql);
}

async function templateSql(command) {
  const result = await templateQuery(command);
  assert.equal(result.code, 0, result.stderr);
  return result.stdout;
}

function query(sql) {
  return docker(['exec', '-i', container, 'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'], sql);
}

async function sql(command) {
  const result = await query(command);
  assert.equal(result.code, 0, result.stderr);
  return result.stdout;
}

async function until(predicate, label) {
  for (let i = 0; i < 30; i++) {
    if (await predicate()) return;
    await delay(100);
  }
  throw new Error(label);
}

async function runOrderClose() {
  const inspected = await docker(['inspect', '--format', '{{.Name}}', container]);
  assert.equal(inspected.code, 0, inspected.stderr);
  assert.equal(inspected.stdout, `/${container}`);
  await until(async () => (await docker(['exec', container, 'pg_isready', '-U', 'postgres'])).code === 0, 'Disposable DB not ready');
  assert.equal(await sql("SELECT to_regprocedure('public.create_pedido_task(uuid,jsonb)') IS NOT NULL AND to_regprocedure('public.set_pedido_status(uuid,uuid,text)') IS NOT NULL"), 't', 'M05 command RPCs missing');
  assert.equal(await sql("SELECT count(*) FROM auth.users WHERE id IN ('05000000-0000-4000-8000-000000000001','05000000-0000-4000-8000-000000000002','05000000-0000-4000-8000-000000000003')"), '0', 'Fixture user collision');
  assert.equal(await sql("SELECT count(*) FROM public.organizations WHERE id IN ('05000001-0000-4000-8000-000000000001','05000001-0000-4000-8000-000000000002')"), '0', 'Fixture tenant collision');
  const base = await readFile(new URL('supabase/tests/helpers/pedidos-v1-fixtures.sql', root), 'utf8');
  await sql(`BEGIN; ${base}\nCOMMIT;`);
  const initialTasks = await sql(`SELECT count(*) FROM public.tarefas WHERE organization_id='${org}' AND pedido_id='${order}'`);
  const sessions = [];
  try {
    const closing = query(`BEGIN; SET LOCAL statement_timeout='15s'; SET LOCAL application_name='gate1c1-close'; ${auth} SELECT public.set_pedido_status('${org}','${order}','Finalizado'); SELECT pg_sleep(6); COMMIT;`);
    sessions.push(closing);
    await until(async () => await sql("SELECT count(*) FROM pg_stat_activity WHERE application_name='gate1c1-close' AND wait_event='PgSleep'") === '1', 'Close transaction never reached barrier');
    const creating = query(`BEGIN; SET LOCAL statement_timeout='15s'; SET LOCAL application_name='gate1c1-create'; ${auth} SELECT public.create_pedido_task('${org}',jsonb_build_object('title','Concurrent task','orderId','${order}','frontId',NULL)); COMMIT;`);
    sessions.push(creating);
    await until(async () => await sql("SELECT count(*) FROM pg_stat_activity WHERE application_name='gate1c1-create' AND cardinality(pg_blocking_pids(pid))>0") === '1', 'Task creation did not wait for the order lock');
    const [closeResult, createResult] = await Promise.all(sessions);
    assert.equal(closeResult.code, 0, closeResult.stderr);
    assert.notEqual(createResult.code, 0, 'Task creation committed after order finalization');
    assert.match(createResult.stderr, /23514/, 'Closed order must reject the waiting task command');
    assert.equal(await sql(`SELECT status FROM public.pedidos WHERE organization_id='${org}' AND id='${order}'`), 'Concluído');
    assert.equal(await sql(`SELECT count(*) FROM public.tarefas WHERE organization_id='${org}' AND pedido_id='${order}'`), initialTasks);
    console.log('PASS: explicit close held the order lock; concurrent task creation waited, revalidated, and was rejected (23514).');
  } finally {
    await Promise.allSettled(sessions);
    await sql("BEGIN; DELETE FROM public.anexos WHERE organization_id IN ('05000001-0000-4000-8000-000000000001','05000001-0000-4000-8000-000000000002'); DELETE FROM public.organizations WHERE id IN ('05000001-0000-4000-8000-000000000001','05000001-0000-4000-8000-000000000002'); DELETE FROM auth.users WHERE id IN ('05000000-0000-4000-8000-000000000001','05000000-0000-4000-8000-000000000002','05000000-0000-4000-8000-000000000003'); COMMIT;");
  }
}

async function runTemplateRequest() {
  const inspected = await templateDocker(['inspect', '--format', '{{.Name}}', templateContainer]);
  assert.equal(inspected.code, 0, inspected.stderr);
  assert.equal(inspected.stdout, `/${templateContainer}`);
  await until(async () => (await templateDocker(['exec', templateContainer, 'pg_isready', '-U', 'postgres'])).code === 0, 'Disposable DB not ready');
  assert.equal(await templateSql("SELECT to_regprocedure('public.instantiate_pedido_template(uuid,jsonb)') IS NOT NULL"), 't', 'M10 template RPC missing');
  assert.equal(await templateSql(`SELECT count(*) FROM auth.users WHERE id='${templateActor}'`), '0', 'Template fixture user collision');
  assert.equal(await templateSql(`SELECT count(*) FROM public.organizations WHERE id='${templateOrg}'`), '0', 'Template fixture tenant collision');
  await templateSql(`BEGIN;
    INSERT INTO auth.users(id) VALUES('${templateActor}');
    INSERT INTO public.organizations(id,name,slug) VALUES('${templateOrg}','Template concurrency QA','template-concurrency-qa');
    INSERT INTO public.organization_members(organization_id,user_id,role,display_name)
      VALUES('${templateOrg}','${templateActor}','admin','Template Concurrency Admin');
    INSERT INTO public.pedido_templates(id,organization_id,nome,version,definition,created_by)
      VALUES('${templateId}','${templateOrg}','Template concorrente',1,
        '{"schemaVersion":1,"fronts":[{"key":"f","name":"Geral","position":0}],
          "tasks":[{"key":"t","frontKey":"f","title":"Tarefa","description":null,
            "priority":"Normal","dueRule":{"kind":"creation","offsetDays":0},"followUpRule":null}],
          "subtasks":[],"dependencies":[]}'::jsonb,'${templateActor}');
    COMMIT;`);
  const payload = `jsonb_build_object(
    'templateId','${templateId}','expectedVersion',1,'requestId','${templateRequest}',
    'timeZone','America/Sao_Paulo','order',jsonb_build_object(
      'number','QA-M10-CONCURRENT','title','Pedido concorrente','client','Cliente QA',
      'address','Rua QA','legacyPriority','Normal','utilityDueDate',NULL))`;
  const sessions = [];
  try {
    const first = templateQuery(`BEGIN; SET LOCAL statement_timeout='15s'; SET LOCAL application_name='gate4b-template-a';
      ${templateAuth} SELECT public.instantiate_pedido_template('${templateOrg}',${payload}); SELECT pg_sleep(6); COMMIT;`);
    sessions.push(first);
    await until(async () => await templateSql("SELECT count(*) FROM pg_stat_activity WHERE application_name='gate4b-template-a' AND wait_event='PgSleep'") === '1', 'First template request never reached barrier');
    const second = templateQuery(`BEGIN; SET LOCAL statement_timeout='15s'; SET LOCAL application_name='gate4b-template-b';
      ${templateAuth} SELECT public.instantiate_pedido_template('${templateOrg}',${payload}); COMMIT;`);
    sessions.push(second);
    await until(async () => await templateSql("SELECT count(*) FROM pg_stat_activity WHERE application_name='gate4b-template-b' AND cardinality(pg_blocking_pids(pid))>0") === '1', 'Repeated template request did not wait for the unique request key');
    const [a, b] = await Promise.all(sessions);
    assert.equal(a.code, 0, a.stderr);
    assert.equal(b.code, 0, b.stderr);
    const aId = a.stdout.split(/\s+/).find(value => /^[0-9a-f-]{36}$/.test(value));
    const bId = b.stdout.split(/\s+/).find(value => /^[0-9a-f-]{36}$/.test(value));
    assert.ok(aId, `First request did not return an order id: ${a.stdout}`);
    assert.equal(bId, aId, 'Concurrent retry returned another order id');
    assert.equal(await templateSql(`SELECT count(*) FROM public.pedidos WHERE organization_id='${templateOrg}' AND template_request_id='${templateRequest}'`), '1');
    assert.equal(await templateSql(`SELECT count(*) FROM public.tarefas WHERE organization_id='${templateOrg}'`), '1');
    console.log('PASS: concurrent template retries serialized on requestId and returned one Pedido with one task.');
  } finally {
    await Promise.allSettled(sessions);
    await templateSql(`BEGIN; DELETE FROM public.organizations WHERE id='${templateOrg}'; DELETE FROM auth.users WHERE id='${templateActor}'; COMMIT;`);
  }
}

async function main() {
  const mode = process.argv[2];
  assert.ok(['dependencies', 'order-close', 'template-request'].includes(mode), 'Usage: node scripts/tests/pedidos-concurrency.mjs dependencies|order-close|template-request');
  assert.equal(process.argv.length, 3, 'Exactly one concurrency mode is required');
  if (mode === 'template-request') {
    await runTemplateRequest();
    return;
  }
  if (mode === 'order-close') {
    await runOrderClose();
    return;
  }
  const inspected = await docker(['inspect', '--format', '{{.Name}}', container]);
  assert.equal(inspected.code, 0, inspected.stderr);
  assert.equal(inspected.stdout, `/${container}`);
  await until(async () => (await docker(['exec', container, 'pg_isready', '-U', 'postgres'])).code === 0, 'Disposable DB not ready');
  assert.equal(await sql("SELECT to_regprocedure('public.add_pedido_dependency(uuid,uuid,uuid)') IS NOT NULL"), 't', 'Dependency RPC missing: cannot safely serialize inverse edges before M03');
  assert.equal(await sql("SELECT count(*) FROM auth.users WHERE id IN ('05000000-0000-4000-8000-000000000001','05000000-0000-4000-8000-000000000002','05000000-0000-4000-8000-000000000003')"), '0', 'Fixture user collision');
  assert.equal(await sql("SELECT count(*) FROM public.organizations WHERE id IN ('05000001-0000-4000-8000-000000000001','05000001-0000-4000-8000-000000000002')"), '0', 'Fixture tenant collision');
  const base = await readFile(new URL('supabase/tests/helpers/pedidos-v1-fixtures.sql', root), 'utf8');
  const extra = await readFile(new URL('supabase/tests/helpers/pedidos-v1-dependency-fixtures.sql', root), 'utf8');
  // Failed setup rolls back; cleanup ownership starts only after successful setup.
  await sql(`BEGIN; ${base}\n${extra}\nCOMMIT;`);
  const sessions = [];
  try {
    // Fail closed for stale transaction snapshots; RPC normally runs READ COMMITTED.
    const stale = await query(`BEGIN ISOLATION LEVEL REPEATABLE READ; ${auth} SELECT public.add_pedido_dependency('${org}','${taskA}','${taskC}'); ROLLBACK;`);
    assert.notEqual(stale.code, 0, 'Repeatable-read snapshot must not bypass graph serialization');
    assert.match(stale.stderr, /25001/, 'Expected explicit unsupported isolation rejection');
    const a = query(`BEGIN; SET LOCAL statement_timeout='15s'; SET LOCAL application_name='gate1a3-a'; ${auth} SELECT public.add_pedido_dependency('${org}','${taskA}','${taskC}'); SELECT pg_sleep(6); COMMIT;`);
    sessions.push(a);
    await until(async () => await sql("SELECT count(*) FROM pg_stat_activity WHERE application_name='gate1a3-a' AND wait_event='PgSleep'") === '1', 'First transaction never reached barrier');
    const b = query(`BEGIN; SET LOCAL statement_timeout='15s'; SET LOCAL application_name='gate1a3-b'; ${auth} SELECT public.add_pedido_dependency('${org}','${taskC}','${taskA}'); COMMIT;`);
    sessions.push(b);
    await until(async () => await sql("SELECT count(*) FROM pg_stat_activity WHERE application_name='gate1a3-b' AND cardinality(pg_blocking_pids(pid))>0") === '1', 'Inverse edge did not wait for the order lock');
    const [first, second] = await Promise.all(sessions);
    assert.equal(first.code, 0, first.stderr);
    assert.notEqual(second.code, 0, 'Both inverse edges committed');
    assert.match(second.stderr, /23514/, 'Inverse edge must fail with cycle constraint error');
    assert.equal(await sql(`SELECT count(*) FROM public.tarefa_dependencias WHERE organization_id='${org}' AND pedido_id='${order}'`), '1');
    assert.equal(await sql(`SELECT count(*) FROM public.tarefa_dependencias WHERE organization_id='${org}' AND tarefa_id='${taskA}' AND predecessora_id='${taskC}'`), '1');
    console.log('PASS: two authenticated sessions; order lock observed; inverse edge rejected (23514); one edge remains; stale isolation rejected.');
  } finally {
    await Promise.allSettled(sessions);
    await sql("BEGIN; DELETE FROM public.anexos WHERE organization_id IN ('05000001-0000-4000-8000-000000000001','05000001-0000-4000-8000-000000000002'); DELETE FROM public.organizations WHERE id IN ('05000001-0000-4000-8000-000000000001','05000001-0000-4000-8000-000000000002'); DELETE FROM auth.users WHERE id IN ('05000000-0000-4000-8000-000000000001','05000000-0000-4000-8000-000000000002','05000000-0000-4000-8000-000000000003'); COMMIT;");
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
