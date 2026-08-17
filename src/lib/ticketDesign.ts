import { isSupabaseConfigured, supabase } from "./supabase";
import { defaultPrinterSettings, loadCachedTicketDesign, saveCachedTicketDesign, ticketDesignFrom, type TicketDesign } from "./printerSettings";

const SETTINGS_KEY = "ticket_design";

function fallbackDesign() {
  return loadCachedTicketDesign();
}

export async function loadUniversalTicketDesign(): Promise<TicketDesign> {
  if (!isSupabaseConfigured || !supabase || !navigator.onLine) return fallbackDesign();
  const { data, error } = await supabase.from("branch_settings").select("value").eq("key", SETTINGS_KEY).maybeSingle();
  if (error) throw new Error("No se pudo cargar la configuración universal del ticket.");
  if (!data?.value || typeof data.value !== "object") return fallbackDesign();
  return saveCachedTicketDesign(data.value as TicketDesign);
}

export async function saveUniversalTicketDesign(design: TicketDesign): Promise<TicketDesign> {
  const cached = saveCachedTicketDesign(design);
  if (!isSupabaseConfigured || !supabase || !navigator.onLine) return cached;
  const { error } = await supabase.from("branch_settings").upsert({ key: SETTINGS_KEY, value: cached, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error("La configuración se guardó en esta estación, pero no se pudo compartir con las demás.");
  return cached;
}

export function defaultTicketDesign() {
  return ticketDesignFrom(defaultPrinterSettings);
}
