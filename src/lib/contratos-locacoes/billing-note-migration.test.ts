import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('billing note visibility migration', () => {
  it('defaults existing and future cycles to private while preserving restricted writes and resend tracking', () => {
    const sql = readFileSync(path.resolve(__dirname, '../../../supabase/migrations/20260923191720_internal_billing_notes_invoice_visibility.sql'), 'utf8');
    expect(sql).toMatch(/ADD COLUMN show_note_on_invoice boolean NOT NULL DEFAULT false/i);
    expect(sql).toMatch(/GRANT INSERT \(show_note_on_invoice\) ON public\.billing_cycles TO authenticated/i);
    expect(sql).toMatch(/GRANT UPDATE \(show_note_on_invoice\) ON public\.billing_cycles TO authenticated/i);
    expect(sql).toMatch(/OLD\.show_note_on_invoice IS DISTINCT FROM NEW\.show_note_on_invoice[\s\S]*NEW\.content_revision := OLD\.content_revision \+ 1/i);
    expect(sql).toMatch(/IF OLD\.sent_at IS NOT NULL THEN[\s\S]*NEW\.needs_resend := true/i);
  });
});
