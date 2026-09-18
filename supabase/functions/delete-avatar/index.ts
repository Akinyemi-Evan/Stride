import { createClient } from "npm:@supabase/supabase-js@2";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "POST required" }, 405);
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer "))
    return reply({ error: "Unauthorized" }, 401);
  const url = Deno.env.get("SUPABASE_URL")!;
  const client = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) return reply({ error: "Unauthorized" }, 401);
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: jobs, error: readError } = await admin
    .from("avatar_jobs")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "processing");
  if (readError) return reply({ error: "Could not read avatar state" }, 500);
  if (jobs?.length)
    return reply(
      { error: "Wait until avatar generation finishes before deleting." },
      409,
    );
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("avatar_path")
    .eq("id", user.id)
    .single();
  if (profileError) return reply({ error: "Could not read profile" }, 500);
  if (profile.avatar_path) {
    const { error: deleteError } = await admin.storage
      .from("avatars")
      .remove([profile.avatar_path]);
    if (deleteError)
      return reply(
        { error: "Could not delete the image; retry deletion." },
        500,
      );
    const { error: clearError } = await admin
      .from("profiles")
      .update({ avatar_path: null })
      .eq("id", user.id)
      .eq("avatar_path", profile.avatar_path);
    if (clearError) return reply({ error: "Could not clear avatar" }, 500);
  }
  return reply({ ok: true });
});
