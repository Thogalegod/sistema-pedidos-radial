import { execFileSync, spawn } from 'node:child_process';
import { File as NodeFile } from 'node:buffer';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BOLETO_DOCUMENT_BUCKET,
  buildBoletoStoragePath,
  createSupabaseContractsLocacoesBoletoDocumentClient,
  getBoletoSignedUrl,
  repairPendingBoletoChange,
  replaceBoletoDocument,
  saveBoletoDocument,
} from './boleto-documents';
import {
  createSupabaseContractsLocacoesPaymentProofClient,
  savePaymentProofDocument,
} from './payment-proofs';
import {
  createSupabaseContractsLocacoesRemittanceDocumentClient,
  saveRemittanceInvoiceDocument,
} from './remittance-documents';
import type { BillingCycle, Contract, ContractDocument, Payment } from './types';

const local = {
  url: process.env.BOLETO_LOCAL_SUPABASE_URL,
  publishableKey: process.env.BOLETO_LOCAL_PUBLISHABLE_KEY,
  secretKey: process.env.BOLETO_LOCAL_SECRET_KEY,
  dbContainer: process.env.BOLETO_LOCAL_DB_CONTAINER,
};
const dockerWslDistro = process.env.BOLETO_LOCAL_DOCKER_WSL_DISTRO;
const enabled = Object.values(local).every(Boolean);
const bucket = BOLETO_DOCUMENT_BUCKET;
const password = 'Local-only-boleto-2026!';
const nonce = crypto.randomUUID();

function newClient(key: string) {
  return createClient(local.url!, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: `boleto-local-${crypto.randomUUID()}`,
    },
  });
}

async function dataOrThrow<T>(promise: PromiseLike<{ data: T; error: { message: string } | null }>) {
  const { data, error } = await promise;
  if (error) throw new Error(error.message);
  if (data == null) throw new Error('Local Supabase returned no data');
  return data as NonNullable<T>;
}

async function signIn(email: string) {
  const client = newClient(local.publishableKey!);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  return client;
}

function pdf(label: string) {
  return new NodeFile([`%PDF-1.4\n${label}`], 'boleto.pdf', {
    type: 'application/pdf',
  }) as unknown as File;
}

function uploadedFile(content: string, name: string, type: string) {
  return new NodeFile([content], name, { type }) as unknown as File;
}

function dbExec(sql: string) {
  const dockerCommand = dockerWslDistro ? 'wsl.exe' : 'docker';
  const dockerPrefix = dockerWslDistro ? ['-d', dockerWslDistro, '--', 'docker'] : [];
  return execFileSync(dockerCommand, [...dockerPrefix,
    'exec', '-i', local.dbContainer!, 'psql', '-v', 'ON_ERROR_STOP=1',
    '-U', 'postgres', '-d', 'postgres', '-q', '-A', '-t',
  ], { input: sql, encoding: 'utf8' }).trim();
}

function dbExecAsync(sql: string) {
  const dockerCommand = dockerWslDistro ? 'wsl.exe' : 'docker';
  const dockerPrefix = dockerWslDistro ? ['-d', dockerWslDistro, '--', 'docker'] : [];

  return new Promise<string>((resolve, reject) => {
    const child = spawn(dockerCommand, [...dockerPrefix,
      'exec', '-i', local.dbContainer!, 'psql', '-v', 'ON_ERROR_STOP=1',
      '-U', 'postgres', '-d', 'postgres', '-q', '-A', '-t',
    ]);
    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => { stdout += chunk; });
    child.stderr.on('data', (chunk: string) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }
      reject(new Error(stderr.trim() || `psql exited with code ${code}`));
    });
    child.stdin.end(sql);
  });
}

async function waitForDbValue(sql: string, expected: string, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  let actual = '';

  while (Date.now() < deadline) {
    actual = dbExec(sql);
    if (actual === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(`Timed out waiting for database value ${expected}; last value was ${actual}`);
}

describe.runIf(enabled)('boleto Storage against an isolated local Supabase stack', () => {
  const organizationA = crypto.randomUUID();
  const organizationB = crypto.randomUUID();
  const customerId = crypto.randomUUID();
  const siteId = crypto.randomUUID();
  const contractId = crypto.randomUUID();
  const contractWithoutRemittanceId = crypto.randomUUID();
  const cycleAdminId = crypto.randomUUID();
  const cycleRecoveryId = crypto.randomUUID();
  const cycleSecurityId = crypto.randomUUID();
  const cycleRaceId = crypto.randomUUID();
  const cycleOtherId = crypto.randomUUID();
  const cycleProofId = crypto.randomUUID();
  const paymentId = crypto.randomUUID();
  const objectPaths = new Set<string>();
  const userIds: string[] = [];

  let setup: SupabaseClient;
  let admin: SupabaseClient;
  let finance: SupabaseClient;
  let member: SupabaseClient;
  let tenantB: SupabaseClient;
  let anonymous: SupabaseClient;
  let contract: Contract;
  let cycles: Record<string, BillingCycle>;
  let payment: Payment;

  const canonicalPath = (billingCycleId: string) => buildBoletoStoragePath({
    organizationId: organizationA,
    contractId,
    billingCycleId,
  });

  beforeAll(async () => {
    setup = newClient(local.secretKey!);
    const profiles = [
      ['admin', 'admin'],
      ['finance', 'finance'],
      ['member', 'member'],
      ['tenant-b', 'tenantB'],
    ] as const;
    const users = {} as Record<(typeof profiles)[number][1], { id: string; email: string }>;

    for (const [mailbox, key] of profiles) {
      const email = `boleto-${mailbox}-${nonce}@local.test`;
      const { data: created, error: createError } = await setup.auth.admin.createUser({
        email, password, email_confirm: true,
      });
      if (createError) throw new Error(createError.message);
      if (!created.user) throw new Error(`Auth user ${key} was not created`);
      users[key] = { id: created.user.id, email };
      userIds.push(created.user.id);
    }

    const cycleIds = [cycleAdminId, cycleRecoveryId, cycleSecurityId, cycleRaceId, cycleOtherId, cycleProofId];
    const cycleValues = cycleIds.map((id, index) =>
      `('${id}', '${organizationA}', '${contractId}', ${index + 1}, '2026-0${index + 1}-01', ` +
      `'2026-0${index + 1}-28', '2026-0${index + 1}-01', '2026-0${index + 1}-10', ` +
      `10000, 0, 0, 0, 10000, 'receipt', 'issued')`
    ).join(',\n');
    dbExec(`
      INSERT INTO public.organizations (id, name, slug) VALUES
        ('${organizationA}', 'Boleto local A', 'boleto-a-${nonce}'),
        ('${organizationB}', 'Boleto local B', 'boleto-b-${nonce}');
      INSERT INTO public.organization_members (organization_id, user_id, role, can_manage_billing) VALUES
        ('${organizationA}', '${users.admin.id}', 'admin', false),
        ('${organizationA}', '${users.finance.id}', 'member', true),
        ('${organizationA}', '${users.member.id}', 'member', false),
        ('${organizationB}', '${users.tenantB.id}', 'member', true);
      INSERT INTO public.customers (id, organization_id, legal_name, trade_name)
        VALUES ('${customerId}', '${organizationA}', 'Cliente local', 'Cliente local');
      INSERT INTO public.customer_sites
        (id, organization_id, customer_id, name, address_line, number, district, city, state, postal_code)
        VALUES ('${siteId}', '${organizationA}', '${customerId}', 'Obra local', 'Rua local', '1',
          'Centro', 'São Paulo', 'SP', '01001000');
      INSERT INTO public.contracts
        (id, organization_id, internal_number, kind, contract_company, customer_id, site_id,
         has_remittance_invoice, start_date, recurrence_days, pricing_model, base_amount, status)
        VALUES
          ('${contractId}', '${organizationA}', 991001, 'rental', 'fontes', '${customerId}',
            '${siteId}', true, '2026-01-01', 30, 'fixed', 10000, 'active'),
          ('${contractWithoutRemittanceId}', '${organizationA}', 991002, 'rental', 'fontes',
            '${customerId}', '${siteId}', false, '2026-01-01', 30, 'fixed', 10000, 'active');
      INSERT INTO public.billing_cycles
        (id, organization_id, contract_id, sequence_number, period_start, period_end, issue_date,
         due_date, base_amount, discount_amount, surcharge_amount, exemption_amount, total_amount,
         document_type, status)
        VALUES ${cycleValues};
      INSERT INTO public.payments (id, organization_id, billing_cycle_id, paid_at, amount)
        VALUES ('${paymentId}', '${organizationA}', '${cycleProofId}', '2026-05-10T12:00:00Z', 10000);
    `);

    contract = {
      id: contractId, organization_id: organizationA, kind: 'rental', has_remittance_invoice: true,
    } as Contract;
    cycles = Object.fromEntries(cycleIds.map((id) => [id, {
      id, organization_id: organizationA, contract_id: contractId,
      boleto_change_pending: false, boleto_change_operation_id: null,
    } as BillingCycle]));
    payment = { id: paymentId, organization_id: organizationA, billing_cycle_id: cycleProofId } as Payment;

    admin = await signIn(users.admin.email);
    finance = await signIn(users.finance.email);
    member = await signIn(users.member.email);
    tenantB = await signIn(users.tenantB.email);
    anonymous = newClient(local.publishableKey!);

    const otherPath = canonicalPath(cycleOtherId);
    objectPaths.add(otherPath);
    await dataOrThrow(setup.storage.from(bucket).upload(otherPath, pdf('unrelated stable object'), {
      contentType: 'application/pdf', upsert: false,
    }));
    dbExec(`
      INSERT INTO public.contract_documents
        (organization_id, contract_id, billing_cycle_id, payment_id, inspection_id, kind,
         storage_path, file_name, content_type, created_by)
      VALUES ('${organizationA}', '${contractId}', '${cycleOtherId}', NULL, NULL, 'other',
        '${otherPath}', 'other.pdf', 'application/pdf', '${users.admin.id}');
    `);
  }, 30_000);

  afterAll(async () => {
    if (setup) {
      if (objectPaths.size > 0) await setup.storage.from(bucket).remove([...objectPaths]);
      dbExec(`DELETE FROM public.organizations WHERE id IN ('${organizationA}', '${organizationB}');`);
      for (const userId of userIds) await setup.auth.admin.deleteUser(userId);
    }
  }, 30_000);

  it('keeps one canonical object through admin save, signed read and replacement', async () => {
    const client = createSupabaseContractsLocacoesBoletoDocumentClient(admin);
    const billing = cycles[cycleAdminId];
    const path = canonicalPath(cycleAdminId);
    objectPaths.add(path);

    const initialOperation = crypto.randomUUID();
    const initial = await saveBoletoDocument(client, contract, billing, pdf('admin initial'), initialOperation);
    expect(initial.document.storage_path).toBe(path);
    expect(BigInt(String(initial.billing.content_revision))).toBe(BigInt(1));
    expect(await getBoletoSignedUrl(client, initial.document)).toContain('/storage/v1/object/sign/');

    const updateOperation = crypto.randomUUID();
    await client.beginBoletoChange({
      organizationId: organizationA,
      contractId,
      billingCycleId: cycleAdminId,
      operationId: updateOperation,
    });
    const pendingUpdate = await admin.storage.from(bucket).update(
      path,
      pdf('admin pending update'),
      { contentType: 'application/pdf' }
    );
    expect(pendingUpdate.error).toBeNull();
    const updated = await client.finishBoletoChange({
      organizationId: organizationA,
      contractId,
      billingCycleId: cycleAdminId,
      operationId: updateOperation,
    });
    expect(BigInt(String(updated.billing.content_revision))).toBe(BigInt(2));

    const replaceOperation = crypto.randomUUID();
    const replaced = await replaceBoletoDocument(
      client, contract, updated.billing, initial.document, pdf('admin replacement'), replaceOperation
    );
    expect(replaced.document.id).toBe(initial.document.id);
    expect(replaced.document.storage_path).toBe(path);
    expect(BigInt(String(replaced.billing.content_revision))).toBe(BigInt(3));

    const stableOverwrite = await admin.storage.from(bucket).update(
      path,
      pdf('forbidden stable overwrite'),
      { contentType: 'application/pdf' }
    );
    expect(stableOverwrite.error).not.toBeNull();

    const repeated = await client.finishBoletoChange({
      organizationId: organizationA, contractId, billingCycleId: cycleAdminId, operationId: replaceOperation,
    });
    expect(repeated.already_finished).toBe(true);
    expect(BigInt(String(repeated.billing.content_revision))).toBe(BigInt(3));

    const listed = await dataOrThrow(admin.storage.from(bucket).list(`${organizationA}/${contractId}/boleto`));
    expect(listed.filter((item) => item.name === `${cycleAdminId}.pdf`)).toHaveLength(1);
  }, 30_000);

  it('recovers a lost finish response without changing operation or double-incrementing revision', async () => {
    const realClient = createSupabaseContractsLocacoesBoletoDocumentClient(finance);
    const billing = cycles[cycleRecoveryId];
    const operationId = crypto.randomUUID();
    const path = canonicalPath(cycleRecoveryId);
    objectPaths.add(path);

    await expect(saveBoletoDocument({
      ...realClient,
      async finishBoletoChange() { throw new Error('simulated lost finish response'); },
    }, contract, billing, pdf('finance lost response'), operationId)).rejects.toThrow(/permaneceu pendente/i);

    const pending = await dataOrThrow(finance.from('billing_cycles').select('*')
      .eq('organization_id', organizationA).eq('id', cycleRecoveryId).single()) as BillingCycle;
    expect(pending.boleto_change_pending).toBe(true);
    expect(pending.boleto_change_operation_id).toBe(operationId);
    await expect(realClient.beginBoletoChange({
      organizationId: organizationA, contractId, billingCycleId: cycleRecoveryId,
      operationId: crypto.randomUUID(),
    })).rejects.toThrow(/pending|pendente|conflict/i);

    const repaired = await repairPendingBoletoChange(realClient, contract, pending, pdf('finance recovery'));
    expect(repaired.already_finished).toBe(false);
    expect(repaired.billing.boleto_change_pending).toBe(false);
    expect(BigInt(String(repaired.billing.content_revision))).toBe(BigInt(1));
    const documents = await realClient.listBoletoDocuments(organizationA, contractId);
    expect(documents.filter((item) => item.billing_cycle_id === cycleRecoveryId)).toHaveLength(1);
    const listed = await dataOrThrow(finance.storage.from(bucket).list(`${organizationA}/${contractId}/boleto`));
    const objects = listed.filter((item) => item.name === `${cycleRecoveryId}.pdf`);
    expect(objects).toHaveLength(1);
    const objectTimestamp = objects[0].updated_at ?? objects[0].created_at;
    expect(objectTimestamp).toBeTruthy();
    expect(new Date(objectTimestamp!).getTime())
      .toBeGreaterThanOrEqual(new Date(pending.boleto_change_started_at!).getTime());
  }, 30_000);

  it('denies an overwrite queued behind finish after pending becomes false', async () => {
    const client = createSupabaseContractsLocacoesBoletoDocumentClient(finance);
    const operationId = crypto.randomUUID();
    const path = canonicalPath(cycleRaceId);
    const input = {
      organizationId: organizationA,
      contractId,
      billingCycleId: cycleRaceId,
      operationId,
    };
    const blockerName = `boleto-race-blocker-${crypto.randomUUID()}`;
    objectPaths.add(path);

    await client.beginBoletoChange(input);
    await client.uploadObject(bucket, path, pdf('race initial'), {
      contentType: 'application/pdf',
      upsert: false,
    });

    const blocker = dbExecAsync(`
      SET application_name = '${blockerName}';
      BEGIN;
      SELECT 1
      FROM storage.objects
      WHERE bucket_id = '${bucket}' AND name = '${path}'
      FOR UPDATE;
      SELECT pg_sleep(30);
      ROLLBACK;
    `).then(
      () => ({ ok: true as const, error: null }),
      (error: unknown) => ({ ok: false as const, error })
    );

    await waitForDbValue(`
      SELECT count(*)::text
      FROM pg_catalog.pg_stat_activity
      WHERE application_name = '${blockerName}' AND wait_event = 'PgSleep';
    `, '1');
    const blockerPid = dbExec(`
      SELECT pid::text
      FROM pg_catalog.pg_stat_activity
      WHERE application_name = '${blockerName}' AND wait_event = 'PgSleep';
    `);

    const finish = client.finishBoletoChange(input);
    await waitForDbValue(`
      SELECT count(*)::text
      FROM pg_catalog.pg_stat_activity
      WHERE wait_event_type = 'Lock' AND query ILIKE '%finish_boleto_change%';
    `, '1');

    const lateOverwrite = finance.storage.from(bucket).update(
      path,
      pdf('race late overwrite'),
      { contentType: 'application/pdf' }
    );
    await waitForDbValue(`
      SELECT CASE WHEN count(*) >= 2 THEN '1' ELSE '0' END
      FROM pg_catalog.pg_stat_activity
      WHERE wait_event_type = 'Lock' AND pid <> pg_backend_pid();
    `, '1');

    expect(dbExec(`SELECT pg_terminate_backend(${blockerPid})::text;`)).toBe('true');

    const [finished, overwriteResult, blockerResult] = await Promise.all([
      finish,
      lateOverwrite,
      blocker,
    ]);

    expect(blockerResult.ok).toBe(false);
    expect(finished.billing.boleto_change_pending).toBe(false);
    expect(BigInt(String(finished.billing.content_revision))).toBe(BigInt(1));
    expect(overwriteResult.error).not.toBeNull();

    const stored = await dataOrThrow(finance.storage.from(bucket).download(path));
    expect(await stored.text()).toContain('race initial');
  }, 45_000);

  it('enforces capability, tenant, path, MIME, lifecycle and legacy-document boundaries', async () => {
    const financeClient = createSupabaseContractsLocacoesBoletoDocumentClient(finance);
    const memberClient = createSupabaseContractsLocacoesBoletoDocumentClient(member);
    const tenantBClient = createSupabaseContractsLocacoesBoletoDocumentClient(tenantB);
    const operationId = crypto.randomUUID();
    const input = { organizationId: organizationA, contractId, billingCycleId: cycleSecurityId, operationId };
    const path = canonicalPath(cycleSecurityId);
    objectPaths.add(path);

    await financeClient.beginBoletoChange(input);
    await expect(financeClient.finishBoletoChange(input)).rejects.toThrow();
    const pending = await dataOrThrow(finance.from('billing_cycles').select('*').eq('id', cycleSecurityId).single()) as BillingCycle;
    expect(pending.boleto_change_pending).toBe(true);
    await expect(memberClient.beginBoletoChange(input)).rejects.toThrow();
    await expect(tenantBClient.beginBoletoChange(input)).rejects.toThrow();
    expect(dbExec(
      "SELECT has_function_privilege('anon', " +
      "'public.begin_boleto_change(uuid,uuid,uuid,uuid)', 'EXECUTE');"
    )).toBe('f');

    for (const denied of [member, tenantB, anonymous]) {
      expect((await denied.storage.from(bucket).upload(path, pdf('denied'), {
        contentType: 'application/pdf', upsert: true,
      })).error).not.toBeNull();
    }

    const malformed = [
      `${organizationA}/${contractId}/boleto/not-the-cycle.pdf`,
      `${organizationA}/${crypto.randomUUID()}/boleto/${cycleSecurityId}.pdf`,
      `${organizationA}/${contractId}/boleto/${cycleRecoveryId}.pdf`,
      `${organizationA}/${contractId}/boleto/extra/${cycleSecurityId}.pdf`,
      `${organizationA}/${contractWithoutRemittanceId}/remittance_nf/${cycleSecurityId}.pdf`,
      `${organizationA}/${contractId}/payment_proof/${cycleSecurityId}.pdf`,
    ];
    for (const badPath of malformed) {
      objectPaths.add(badPath);
      expect((await finance.storage.from(bucket).upload(badPath, pdf('malformed'), {
        contentType: 'application/pdf', upsert: true,
      })).error).not.toBeNull();
    }
    expect((await finance.storage.from(bucket).upload(path,
      uploadedFile('png', 'boleto.png', 'image/png'),
      { contentType: 'image/png', upsert: true })).error).not.toBeNull();

    await financeClient.uploadObject(bucket, path, pdf('valid finance'), {
      contentType: 'application/pdf', upsert: true,
    });
    const finished = await financeClient.finishBoletoChange(input);
    expect(finished.billing.boleto_change_pending).toBe(false);
    const removal = await finance.storage.from(bucket).remove([path]);
    if (!removal.error) expect(removal.data ?? []).toHaveLength(0);
    expect((await finance.storage.from(bucket).download(path)).error).toBeNull();
    for (const denied of [member, tenantB, anonymous]) {
      expect((await denied.storage.from(bucket).download(path)).error).not.toBeNull();
    }

    const nextOperationId = crypto.randomUUID();
    const nextInput = { ...input, operationId: nextOperationId };
    await financeClient.beginBoletoChange(nextInput);
    await expect(financeClient.finishBoletoChange(input)).rejects.toThrow();
    const currentPending = await dataOrThrow(finance.from('billing_cycles').select('*')
      .eq('id', cycleSecurityId).single()) as BillingCycle;
    expect(currentPending.boleto_change_operation_id).toBe(nextOperationId);
    const recovered = await repairPendingBoletoChange(financeClient, contract, currentPending, pdf('current operation'));
    expect(BigInt(String(recovered.billing.content_revision))).toBe(BigInt(2));

    const unrelatedStablePath = canonicalPath(cycleOtherId);
    expect((await finance.storage.from(bucket).upload(unrelatedStablePath, pdf('must not overwrite other'), {
      contentType: 'application/pdf', upsert: true,
    })).error).not.toBeNull();

    const remittanceDocument = await saveRemittanceInvoiceDocument(
      createSupabaseContractsLocacoesRemittanceDocumentClient(member), contract,
      uploadedFile('%PDF-1.4 remittance', 'remessa.pdf', 'application/pdf'),
      { now: new Date('2026-06-01T12:00:00Z') }
    );
    objectPaths.add(remittanceDocument.storage_path);
    expect(remittanceDocument.kind).toBe('remittance_nf');
    const proofDocument = await savePaymentProofDocument(
      createSupabaseContractsLocacoesPaymentProofClient(member), contract,
      cycles[cycleProofId], payment,
      uploadedFile('%PDF-1.4 proof', 'comprovante.pdf', 'application/pdf'),
      { now: new Date('2026-06-02T12:00:00Z') }
    );
    objectPaths.add(proofDocument.storage_path);
    expect(proofDocument.kind).toBe('payment_proof');
    const legacyRows = await dataOrThrow(member.from('contract_documents').select('*')
      .in('id', [remittanceDocument.id, proofDocument.id]));
    expect((legacyRows as ContractDocument[]).map((item) => item.kind).sort())
      .toEqual(['payment_proof', 'remittance_nf']);
  }, 45_000);
});
