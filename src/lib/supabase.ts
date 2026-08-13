import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(url && publishableKey && !url.includes("your-project"));

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
