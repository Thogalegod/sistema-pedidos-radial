import 'server-only';

export type BillingEmailMode = 'restricted' | 'production';

export interface BillingEmailConfig {
  mode: BillingEmailMode;
  allowedRecipients: ReadonlySet<string>;
  resendApiKey: string;
  supabaseProjectRef: string;
}

const IURQ_PROJECT_REF = 'iurqgskfuupslrghgtej';
const MISFY_PROJECT_REF = 'misfyiznwnuvldoccciw';
const IURQ_ALLOWED_RECIPIENTS = new Set([
  'thomas@radialenergia.com.br',
  'radial@radialenergia.com.br',
]);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type BillingEmailEnvironment = Readonly<Record<string, string | undefined>>;

function requireValue(env: BillingEmailEnvironment, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`Configuração de e-mail ausente: ${name}`);
  }
  return value;
}

function readProjectRef(urlValue: string): string {
  let hostname: string;
  try {
    hostname = new URL(urlValue).hostname;
  } catch {
    throw new Error('URL do projeto Supabase inválida');
  }

  const match = /^([a-z0-9]+)\.supabase\.co$/i.exec(hostname);
  if (!match) {
    throw new Error('Projeto Supabase desconhecido para envio de cobrança');
  }
  return match[1].toLowerCase();
}

function readMode(value: string): BillingEmailMode {
  if (value !== 'restricted' && value !== 'production') {
    throw new Error('Modo de e-mail inválido');
  }
  return value;
}

function readAllowlist(value: string): Set<string> {
  const recipients = value
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  if (recipients.length === 0 || recipients.some((email) => !EMAIL_PATTERN.test(email))) {
    throw new Error('Allowlist de e-mail inválida');
  }

  return new Set(recipients);
}

export function loadBillingEmailConfig(env: BillingEmailEnvironment): BillingEmailConfig {
  const resendApiKey = requireValue(env, 'RESEND_API_KEY');
  const mode = readMode(requireValue(env, 'BILLING_EMAIL_MODE'));
  const allowedRecipients = readAllowlist(
    requireValue(env, 'BILLING_EMAIL_ALLOWED_RECIPIENTS')
  );
  const supabaseProjectRef = readProjectRef(requireValue(env, 'NEXT_PUBLIC_SUPABASE_URL'));

  if (supabaseProjectRef === MISFY_PROJECT_REF) {
    throw new Error('Envio de cobrança está desabilitado no projeto protegido MISFY');
  }
  if (supabaseProjectRef !== IURQ_PROJECT_REF) {
    throw new Error('Projeto Supabase desconhecido para envio de cobrança');
  }
  if (mode !== 'restricted') {
    throw new Error('Modo production não é permitido no IURQ');
  }
  if ([...allowedRecipients].some((email) => !IURQ_ALLOWED_RECIPIENTS.has(email))) {
    throw new Error('Allowlist do IURQ contém destinatário não aprovado');
  }

  return { mode, allowedRecipients, resendApiKey, supabaseProjectRef };
}

export function isRecipientAllowed(config: BillingEmailConfig, email: string): boolean {
  return config.allowedRecipients.has(email.trim().toLowerCase());
}
