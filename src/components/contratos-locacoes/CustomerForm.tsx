'use client';

import { useId, useMemo, useRef, useState, useTransition } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import {
  customerDraftSchema,
  type CustomerDraftInput,
  type CustomerContactInput,
  type CustomerSiteInput,
} from '@/lib/contratos-locacoes/schemas';
import { useLocalDraft } from '@/lib/contratos-locacoes/use-local-draft';
import { LocalDraftStatus } from './LocalDraftStatus';

type CustomerFormProps = {
  initialValue?: CustomerDraftInput;
  submitLabel: string;
  onSubmit: (value: CustomerDraftInput) => Promise<void> | void;
  draftStorageKey?: string;
};

type FormErrors = {
  form?: string;
};

function normalizeReactId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '');
}

function createEmptySite(id: string): CustomerSiteInput {
  return {
    id,
    name: '',
    address_line: '',
    number: '',
    complement: null,
    district: '',
    city: '',
    state: 'SP',
    postal_code: '',
    notes: null,
    active: true,
  };
}

function createEmptyContact(id: string): CustomerContactInput {
  return {
    id,
    name: '',
    job_title: null,
    department: null,
    phone: null,
    whatsapp: null,
    email: null,
    site_id: null,
    is_primary: false,
    receives_billing: false,
    receives_technical: false,
    notes: null,
  };
}

function createInitialValue(siteId: string, contactId: string): CustomerDraftInput {
  return {
    legal_name: '',
    trade_name: '',
    tax_id: null,
    state_registration: null,
    municipal_registration: null,
    notes: null,
    active: true,
    sites: [createEmptySite(siteId)],
    contacts: [createEmptyContact(contactId)],
  };
}

export function CustomerForm({
  initialValue,
  submitLabel,
  onSubmit,
  draftStorageKey,
}: CustomerFormProps) {
  const [errors, setErrors] = useState<FormErrors>({});
  const [isPending, startTransition] = useTransition();
  const siteIdSeed = normalizeReactId(useId());
  const contactIdSeed = normalizeReactId(useId());
  const initialSiteId = `site-${siteIdSeed}-initial`;
  const initialContactId = `contact-${contactIdSeed}-initial`;
  const siteCounterRef = useRef(1);
  const contactCounterRef = useRef(1);
  const createSiteDraft = () => createEmptySite(`site-${siteIdSeed}-${siteCounterRef.current++}`);
  const createContactDraft = () => createEmptyContact(`contact-${contactIdSeed}-${contactCounterRef.current++}`);
  const baseValue = useMemo(
    () => initialValue ?? createInitialValue(initialSiteId, initialContactId),
    [initialContactId, initialSiteId, initialValue]
  );
  const {
    draft,
    setDraft,
    savedAt,
    status,
    restoreConflictDraft,
    discardLocalDraft,
    markSynced,
  } = useLocalDraft({
    initialValue: baseValue,
    serverValue: initialValue ?? null,
    storageKey: draftStorageKey,
  });

  const siteOptions = useMemo(() => draft.sites.map((site, index) => ({
    id: site.id,
    label: site.name || `Obra ${index + 1}`,
  })), [draft.sites]);

  const inputClass =
    'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
  const sectionCard = 'rounded-2xl border border-gray-200 bg-white p-4 shadow-sm';
  const labelClass = 'mb-1 block text-sm font-medium text-gray-700';

  const updateSite = (siteId: string, key: keyof CustomerSiteInput, value: string | boolean | null) => {
    setDraft((current) => ({
      ...current,
      sites: current.sites.map((site) =>
        site.id === siteId ? { ...site, [key]: value } : site
      ),
    }));
  };

  const updateContact = (
    contactId: string,
    key: keyof CustomerContactInput,
    value: string | boolean | null
  ) => {
    setDraft((current) => ({
      ...current,
      contacts: current.contacts.map((contact) =>
        contact.id === contactId ? { ...contact, [key]: value } : contact
      ),
    }));
  };

  const removeSite = (siteId: string) => {
    setDraft((current) => {
      const sites = current.sites.filter((site) => site.id !== siteId);
      const contacts = current.contacts.map((contact) =>
        contact.site_id === siteId ? { ...contact, site_id: null } : contact
      );

      return {
        ...current,
        sites: sites.length > 0 ? sites : [createSiteDraft()],
        contacts,
      };
    });
  };

  const removeContact = (contactId: string) => {
    setDraft((current) => ({
      ...current,
      contacts:
        current.contacts.length === 1
          ? [createContactDraft()]
          : current.contacts.filter((contact) => contact.id !== contactId),
    }));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrors({});

    const parsed = customerDraftSchema.safeParse(draft);
    if (!parsed.success) {
      const firstMessage = parsed.error.issues[0]?.message ?? 'Revise os campos obrigatórios.';
      setErrors({ form: firstMessage });
      return;
    }

    startTransition(async () => {
      try {
        await onSubmit(parsed.data);
        markSynced(parsed.data);
      } catch (error) {
        setErrors({
          form: error instanceof Error ? error.message : 'Não foi possível salvar o cliente.',
        });
      }
    });
  };

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <LocalDraftStatus
        onDiscard={draftStorageKey ? discardLocalDraft : undefined}
        onRestore={draftStorageKey ? restoreConflictDraft : undefined}
        savedAt={savedAt}
        status={status}
      />

      <section className={sectionCard}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Empresa cliente</h2>
            <p className="text-sm text-gray-500">Dados centrais do cliente e observações gerais.</p>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <input
              checked={draft.active}
              onChange={(event) => setDraft((current) => ({ ...current, active: event.target.checked }))}
              type="checkbox"
            />
            Cliente ativo
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className={labelClass} htmlFor="legal_name">Razão social</label>
            <input
              className={inputClass}
              id="legal_name"
              value={draft.legal_name}
              onChange={(event) => setDraft((current) => ({ ...current, legal_name: event.target.value }))}
            />
          </div>
          <div className="md:col-span-2">
            <label className={labelClass} htmlFor="trade_name">Nome fantasia</label>
            <input
              className={inputClass}
              id="trade_name"
              value={draft.trade_name}
              onChange={(event) => setDraft((current) => ({ ...current, trade_name: event.target.value }))}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="tax_id">CNPJ ou CPF</label>
            <input
              className={inputClass}
              id="tax_id"
              value={draft.tax_id ?? ''}
              onChange={(event) => setDraft((current) => ({ ...current, tax_id: event.target.value }))}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="state_registration">Inscrição estadual</label>
            <input
              className={inputClass}
              id="state_registration"
              value={draft.state_registration ?? ''}
              onChange={(event) => setDraft((current) => ({ ...current, state_registration: event.target.value }))}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="municipal_registration">Inscrição municipal</label>
            <input
              className={inputClass}
              id="municipal_registration"
              value={draft.municipal_registration ?? ''}
              onChange={(event) => setDraft((current) => ({ ...current, municipal_registration: event.target.value }))}
            />
          </div>
          <div className="md:col-span-2">
            <label className={labelClass} htmlFor="customer_notes">Observações</label>
            <textarea
              className={inputClass}
              id="customer_notes"
              rows={3}
              value={draft.notes ?? ''}
              onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
            />
          </div>
        </div>
      </section>

      <section className={sectionCard}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Obras e locais</h2>
            <p className="text-sm text-gray-500">Cadastre uma ou mais obras/locais vinculados ao cliente.</p>
          </div>
          <button
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            type="button"
            onClick={() =>
              setDraft((current) => ({
                ...current,
                sites: [...current.sites, createSiteDraft()],
              }))
            }
          >
            <Plus size={16} />
            Adicionar obra
          </button>
        </div>

        <div className="space-y-4">
          {draft.sites.map((site, index) => (
            <div className="rounded-xl border border-gray-200 p-4" key={site.id}>
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-gray-900">Obra/local {index + 1}</h3>
                <button
                  className="inline-flex items-center gap-2 text-sm font-medium text-red-600 hover:text-red-700"
                  type="button"
                  onClick={() => removeSite(site.id)}
                >
                  <Trash2 size={16} />
                  Remover
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className={labelClass} htmlFor={`site-name-${site.id}`}>Nome da obra</label>
                  <input
                    aria-label="Nome da obra"
                    className={inputClass}
                    id={`site-name-${site.id}`}
                    value={site.name}
                    onChange={(event) => updateSite(site.id, 'name', event.target.value)}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className={labelClass} htmlFor={`site-address-${site.id}`}>Endereço</label>
                  <input
                    aria-label="Endereço"
                    className={inputClass}
                    id={`site-address-${site.id}`}
                    value={site.address_line}
                    onChange={(event) => updateSite(site.id, 'address_line', event.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor={`site-number-${site.id}`}>Número</label>
                  <input
                    aria-label="Número"
                    className={inputClass}
                    id={`site-number-${site.id}`}
                    value={site.number}
                    onChange={(event) => updateSite(site.id, 'number', event.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor={`site-complement-${site.id}`}>Complemento</label>
                  <input
                    className={inputClass}
                    id={`site-complement-${site.id}`}
                    value={site.complement ?? ''}
                    onChange={(event) => updateSite(site.id, 'complement', event.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor={`site-district-${site.id}`}>Bairro</label>
                  <input
                    aria-label="Bairro"
                    className={inputClass}
                    id={`site-district-${site.id}`}
                    value={site.district}
                    onChange={(event) => updateSite(site.id, 'district', event.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor={`site-city-${site.id}`}>Cidade</label>
                  <input
                    aria-label="Cidade"
                    className={inputClass}
                    id={`site-city-${site.id}`}
                    value={site.city}
                    onChange={(event) => updateSite(site.id, 'city', event.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor={`site-state-${site.id}`}>UF</label>
                  <input
                    aria-label="UF"
                    className={inputClass}
                    id={`site-state-${site.id}`}
                    value={site.state}
                    maxLength={2}
                    onChange={(event) => updateSite(site.id, 'state', event.target.value.toUpperCase())}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor={`site-postal-${site.id}`}>CEP</label>
                  <input
                    aria-label="CEP"
                    className={inputClass}
                    id={`site-postal-${site.id}`}
                    value={site.postal_code}
                    onChange={(event) => updateSite(site.id, 'postal_code', event.target.value)}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className={labelClass}>Observações da obra</label>
                  <textarea
                    className={inputClass}
                    rows={2}
                    value={site.notes ?? ''}
                    onChange={(event) => updateSite(site.id, 'notes', event.target.value)}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={sectionCard}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Contatos</h2>
            <p className="text-sm text-gray-500">Use contato geral ou vincule contatos a uma obra específica.</p>
          </div>
          <button
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            type="button"
            onClick={() =>
              setDraft((current) => ({
                ...current,
                contacts: [...current.contacts, createContactDraft()],
              }))
            }
          >
            <Plus size={16} />
            Adicionar contato
          </button>
        </div>

        <div className="space-y-4">
          {draft.contacts.map((contact, index) => (
            <div className="rounded-xl border border-gray-200 p-4" key={contact.id}>
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-gray-900">Contato {index + 1}</h3>
                <button
                  className="inline-flex items-center gap-2 text-sm font-medium text-red-600 hover:text-red-700"
                  type="button"
                  onClick={() => removeContact(contact.id)}
                >
                  <Trash2 size={16} />
                  Remover
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className={labelClass} htmlFor={`contact-name-${contact.id}`}>Nome do contato</label>
                  <input
                    aria-label="Nome do contato"
                    className={inputClass}
                    id={`contact-name-${contact.id}`}
                    value={contact.name}
                    onChange={(event) => updateContact(contact.id, 'name', event.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor={`contact-job-${contact.id}`}>Cargo</label>
                  <input
                    className={inputClass}
                    id={`contact-job-${contact.id}`}
                    value={contact.job_title ?? ''}
                    onChange={(event) => updateContact(contact.id, 'job_title', event.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor={`contact-department-${contact.id}`}>Departamento</label>
                  <input
                    className={inputClass}
                    id={`contact-department-${contact.id}`}
                    value={contact.department ?? ''}
                    onChange={(event) => updateContact(contact.id, 'department', event.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor={`contact-phone-${contact.id}`}>Telefone</label>
                  <input
                    className={inputClass}
                    id={`contact-phone-${contact.id}`}
                    value={contact.phone ?? ''}
                    onChange={(event) => updateContact(contact.id, 'phone', event.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor={`contact-whatsapp-${contact.id}`}>WhatsApp</label>
                  <input
                    className={inputClass}
                    id={`contact-whatsapp-${contact.id}`}
                    value={contact.whatsapp ?? ''}
                    onChange={(event) => updateContact(contact.id, 'whatsapp', event.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor={`contact-email-${contact.id}`}>E-mail</label>
                  <input
                    className={inputClass}
                    type="email"
                    id={`contact-email-${contact.id}`}
                    value={contact.email ?? ''}
                    onChange={(event) => updateContact(contact.id, 'email', event.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor={`contact-site-${contact.id}`}>Vincular à obra</label>
                  <select
                    aria-label="Vincular à obra"
                    className={inputClass}
                    id={`contact-site-${contact.id}`}
                    value={contact.site_id ?? ''}
                    onChange={(event) =>
                      updateContact(contact.id, 'site_id', event.target.value === '' ? null : siteOptions[Number(event.target.value)]?.id ?? null)
                    }
                  >
                    <option value="">Contato geral</option>
                    {siteOptions.map((site, index) => (
                      <option key={site.id} value={index}>
                        {site.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2 grid gap-3 md:grid-cols-3">
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      checked={contact.is_primary}
                      onChange={(event) => updateContact(contact.id, 'is_primary', event.target.checked)}
                      type="checkbox"
                    />
                    Contato principal
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      checked={contact.receives_billing}
                      onChange={(event) => updateContact(contact.id, 'receives_billing', event.target.checked)}
                      type="checkbox"
                    />
                    Recebe financeiro
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      checked={contact.receives_technical}
                      onChange={(event) => updateContact(contact.id, 'receives_technical', event.target.checked)}
                      type="checkbox"
                    />
                    Recebe técnico
                  </label>
                </div>
                <div className="md:col-span-2">
                  <label className={labelClass}>Observações do contato</label>
                  <textarea
                    className={inputClass}
                    rows={2}
                    value={contact.notes ?? ''}
                    onChange={(event) => updateContact(contact.id, 'notes', event.target.value)}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {errors.form ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errors.form}
        </div>
      ) : null}

      <div className="flex justify-end">
        <button
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
          disabled={isPending}
          type="submit"
        >
          {isPending ? <Loader2 className="animate-spin" size={16} /> : null}
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
