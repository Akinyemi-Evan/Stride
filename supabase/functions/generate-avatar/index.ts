import { createClient } from "npm:@supabase/supabase-js@2";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return response({ error: "POST required" }, 405);
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer "))
    return response({ error: "Sign in required" }, 401);
  const url = Deno.env.get("SUPABASE_URL")!,
    anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: auth } },
  });
  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser();
  if (authError || !user) return response({ error: "Sign in required" }, 401);
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey)
    return response({ error: "Avatar generation is not configured" }, 503);
  let body;
  try {
    const raw = await req.text();
    if (raw.length > 11500000)
      return response({ error: "Photo too large" }, 413);
    body = JSON.parse(raw);
  } catch {
    return response({ error: "Invalid request" }, 400);
  }
  const { photoBase64, mimeType, consent } = body;
  if (
    consent !== true ||
    typeof photoBase64 !== "string" ||
    photoBase64.length > 11000000 ||
    !["image/jpeg", "image/png", "image/webp"].includes(mimeType)
  )
    return response(
      { error: "A supported photo and consent are required" },
      400,
    );
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(photoBase64), (c) => c.charCodeAt(0));
  } catch {
    return response({ error: "Invalid photo" }, 400);
  }
  if (bytes.length < 100 || bytes.length > 8 * 1024 * 1024)
    return response({ error: "Photo must be under 8 MB" }, 400);
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: job, error } = await admin.rpc("reserve_avatar", {
    p_user: user.id,
  });
  if (error)
    return response(
      {
        error:
          "A generation is already running, or the daily limit has been reached.",
      },
      429,
    );
  const run = async () => {
    let path: string | undefined;
    try {
      const form = new FormData();
      form.append("model", Deno.env.get("AVATAR_IMAGE_MODEL") ?? "gpt-image-2");
      form.append(
        "image",
        new Blob([bytes], { type: mimeType }),
        "selfie." +
          (mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1]),
      );
      form.append("size", "1536x1024");
      form.append("quality", "medium");
      form.append("output_format", "png");
      form.append(
        "prompt",
        "Create one production avatar sprite atlas, precisely 3 columns by 2 rows of equal square cells, with no borders, labels or text. Each cell shows the SAME adult person from the selfie, preserve facial identity, hairstyle, skin tone, gender presentation, identical front-facing pose and camera scale. Realistic high-end 3D game character. Full body visible with head and feet inside each cell, centered with margins. Fully clothed in forest green athletic t-shirt, black shorts, cream sneakers. Uniform dark gray-green studio background and soft lighting. Row-major stages: 1 exaggerated comically enormous round body and belly, 2 very heavy, 3 moderately heavy, 4 average build, 5 lean athletic, 6 muscular peak athletic. Playful fictional transformation, warm confident expression in every panel. Exactly six non-overlapping complete characters in a strict equal 3x2 grid. Do not add text or extra people.",
      );
      const generated = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: AbortSignal.timeout(210000),
      });
      if (!generated.ok) throw new Error("Image provider failed");
      const result = await generated.json(),
        b64 = result.data?.[0]?.b64_json;
      if (typeof b64 !== "string") throw new Error("Missing generated image");
      const png = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      path = `${user.id}/${job}.png`;
      const { error: uploadError } = await admin.storage
        .from("avatars")
        .upload(path, png, { contentType: "image/png", upsert: false });
      if (uploadError) throw uploadError;
      const { data: previous } = await admin
        .from("profiles")
        .select("avatar_path")
        .eq("id", user.id)
        .single();
      // A deletion can cancel a job; never resurrect an avatar after deletion.
      const { data: active } = await admin
        .from("avatar_jobs")
        .select("status")
        .eq("id", job)
        .single();
      if (active?.status !== "processing") throw new Error("Job cancelled");
      const { error: updateError } = await admin
        .from("profiles")
        .update({ avatar_path: path })
        .eq("id", user.id);
      if (updateError) throw updateError;
      const { error: jobError } = await admin
        .from("avatar_jobs")
        .update({
          status: "ready",
          path,
          finished_at: new Date().toISOString(),
        })
        .eq("id", job);
      if (jobError) throw jobError;
      if (previous?.avatar_path)
        await admin.storage.from("avatars").remove([previous.avatar_path]);
    } catch {
      if (path) await admin.storage.from("avatars").remove([path]);
      await admin
        .from("avatar_jobs")
        .update({ status: "failed", finished_at: new Date().toISOString() })
        .eq("id", job);
    }
    // The selfie is only held in worker memory; never log or persist request contents.
  };
  EdgeRuntime.waitUntil(run());
  return response({ jobId: job }, 202);
});
