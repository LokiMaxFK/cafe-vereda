import { createClient } from "@supabase/supabase-js";

import { isSupabaseConfigured, supabasePublishableKey as publishableKey, supabaseUrl as url } from "./environment";

// Se re-exporta para no obligar a cambiar de origen a todo lo que ya la importa desde aquí.
export { isSupabaseConfigured };

export const supabase = isSupabaseConfigured
  ? createClient(url!, publishableKey!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      realtime: { params: { eventsPerSecond: 10 } }
    })
  : null;

export function usernameToInternalEmail(username: string) {
  const domain = import.meta.env.VITE_AUTH_EMAIL_DOMAIN ?? "pos.veredacafe.mx";
  const safe = username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
  return `${safe}@${domain}`;
}
