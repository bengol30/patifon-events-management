import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type LydiaLead = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  status: string | null;
  event_date: string | null;
  event_type: string | null;
  event_location: string | null;
  estimated_value: number | null;
  created_at: string;
  [key: string]: any;
};

function getLydiaConfig() {
  const url = process.env.SUPABASE_LYDIA_URL;
  const anonKey = process.env.SUPABASE_LYDIA_KEY;
  const email = process.env.SUPABASE_LYDIA_EMAIL;
  const password = process.env.SUPABASE_LYDIA_PASSWORD;

  if (!url || !anonKey || !email || !password) {
    throw new Error('Lydia credentials not configured');
  }

  return { url, anonKey, email, password };
}

export async function createAuthenticatedLydiaClient(): Promise<SupabaseClient> {
  const { url, anonKey, email, password } = getLydiaConfig();

  const supabase = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    throw new Error(`Failed to authenticate with Lydia: ${error.message}`);
  }

  return supabase;
}

export async function listLydiaLeads(limit = 200): Promise<LydiaLead[]> {
  const supabase = await createAuthenticatedLydiaClient();

  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch leads from Lydia: ${error.message}`);
  }

  return data ?? [];
}

export async function getLydiaLeadById(lydiaId: string): Promise<LydiaLead | null> {
  const supabase = await createAuthenticatedLydiaClient();

  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('id', lydiaId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch lead from Lydia: ${error.message}`);
  }

  return data ?? null;
}
