/**
 * Si la aplicación habla con Supabase o corre en modo demostración.
 *
 * Vive aparte de `supabase.ts` porque `db.ts` también necesita saberlo —para no compartir la base
 * local entre ambos modos— e importar `supabase.ts` desde ahí arrastraría la creación del cliente
 * como efecto de importar la base de datos. Al ser el único sitio donde se decide, los dos módulos
 * no pueden desincronizarse: si lo hicieran, la aplicación real abriría la base de la demostración.
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabaseUrl = url;
export const supabasePublishableKey = publishableKey;
export const isSupabaseConfigured = Boolean(url && publishableKey && !url.includes("your-project"));
