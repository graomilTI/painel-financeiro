import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const SUPABASE_URL = 'https://xyzpnuumdqhegxakkyws.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_YDjKfceWqANbNVMaHte2Kw_Dy4_i471';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
