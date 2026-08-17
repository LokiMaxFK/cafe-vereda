import { createClient } from "npm:@supabase/supabase-js@2";

const AUTH_EMAIL_DOMAIN = "pos.veredacafe.mx";
const USERNAME_PATTERN = /^[a-z0-9._-]{2,40}$/;
// Supabase Auth enforces a platform-wide password_min_length floor of 6, which applies to
// admin.updateUserById even though admin.createUser is more lenient — require 6+ for both
// so a PIN set at creation is never rejected later on reset.
const PIN_PATTERN = /^\d{6,8}$/;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "No autorizado." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: callerAuth, error: callerAuthError } = await callerClient.auth.getUser();
  if (callerAuthError || !callerAuth.user) return json({ error: "No autorizado." }, 401);

  const admin = createClient(supabaseUrl, serviceKey);

  const { data: callerProfile, error: callerProfileError } = await admin
    .from("staff_profiles")
    .select("role, active, display_name")
    .eq("id", callerAuth.user.id)
    .single();
  if (callerProfileError || !callerProfile || callerProfile.role !== "manager" || !callerProfile.active) {
    return json({ error: "Sólo gerencia puede administrar personal." }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Cuerpo inválido." }, 400);
  }

  if (body.action === "create") {
    const username = String(body.username ?? "").trim().toLowerCase();
    const displayName = String(body.displayName ?? "").trim();
    const role = body.role === "manager" ? "manager" : body.role === "barista" ? "barista" : null;
    const pin = String(body.pin ?? "");

    if (!USERNAME_PATTERN.test(username)) return json({ error: "Usuario inválido (letras, números, 2-40 caracteres)." }, 400);
    if (!displayName) return json({ error: "El nombre para mostrar es obligatorio." }, 400);
    if (!role) return json({ error: "Rol inválido." }, 400);
    if (!PIN_PATTERN.test(pin)) return json({ error: "El PIN debe ser numérico, de 6 a 8 dígitos." }, 400);

    const email = `${username}@${AUTH_EMAIL_DOMAIN}`;
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: pin,
      email_confirm: true,
      app_metadata: { role }
    });
    if (createError || !created.user) return json({ error: createError?.message ?? "No se pudo crear el acceso." }, 400);

    const { error: profileError } = await admin
      .from("staff_profiles")
      .insert({ id: created.user.id, username, display_name: displayName, role, active: true });
    if (profileError) {
      await admin.auth.admin.deleteUser(created.user.id);
      const message = profileError.code === "23505" ? "Ese usuario ya existe." : profileError.message;
      return json({ error: message }, 400);
    }

    await admin.from("audit_log").insert({
      actor_id: callerAuth.user.id,
      action: "create_staff",
      entity_type: "staff_profiles",
      entity_id: created.user.id,
      after_data: { username, display_name: displayName, role }
    });

    return json({ ok: true, id: created.user.id });
  }

  if (body.action === "reset_pin") {
    const staffId = String(body.staffId ?? "");
    const pin = String(body.pin ?? "");
    if (!staffId) return json({ error: "Falta el identificador del acceso." }, 400);
    if (!PIN_PATTERN.test(pin)) return json({ error: "El PIN debe ser numérico, de 6 a 8 dígitos." }, 400);

    const { error: updateError } = await admin.auth.admin.updateUserById(staffId, { password: pin });
    if (updateError) return json({ error: updateError.message }, 400);

    await admin.from("audit_log").insert({
      actor_id: callerAuth.user.id,
      action: "reset_pin",
      entity_type: "staff_profiles",
      entity_id: staffId
    });

    return json({ ok: true });
  }

  return json({ error: "Acción desconocida." }, 400);
});
