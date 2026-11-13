import { createClient } from '@supabase/supabase-js';
import { clearLocalIdentity, observeLocalAuthIdentity } from './termografia/local-identity';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

if (typeof window !== 'undefined') observeLocalAuthIdentity(supabase);

export async function signOutFromApp() {
  clearLocalIdentity();
  return supabase.auth.signOut();
}
