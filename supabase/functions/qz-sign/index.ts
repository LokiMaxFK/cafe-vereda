import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}

function pemToBytes(pem: string) {
  const encoded = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const binary = atob(encoded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function bytesToBase64(bytes: ArrayBuffer) {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const authorization = req.headers.get("Authorization");
  if (!authorization) return json({ error: "No autorizado." }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const caller = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: auth, error: authError } = await caller.auth.getUser();
  if (authError || !auth.user) return json({ error: "No autorizado." }, 401);

  const admin = createClient(url, serviceKey);
  const { data: staff } = await admin.from("staff_profiles").select("active").eq("id", auth.user.id).single();
  if (!staff?.active) return json({ error: "Usuario inactivo." }, 403);

  const privateKey = Deno.env.get("QZ_PRIVATE_KEY");
  if (!privateKey) return json({ error: "Falta configurar QZ_PRIVATE_KEY." }, 503);

  let body: { request?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }
  if (typeof body.request !== "string" || !body.request.length || body.request.length > 1_000_000) return json({ error: "Solicitud de firma inválida." }, 400);

  try {
    const key = await crypto.subtle.importKey(
      "pkcs8",
      pemToBytes(privateKey),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-512" },
      false,
      ["sign"]
    );
    const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(body.request));
    return json({ signature: bytesToBase64(signature) });
  } catch {
    return json({ error: "No se pudo firmar la solicitud de QZ Tray." }, 500);
  }
});
