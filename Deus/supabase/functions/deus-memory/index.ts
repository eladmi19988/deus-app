import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("DEUS_ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}
function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: { code: "METHOD_NOT_ALLOWED", message: "Use POST." } });
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return json(401, { error: { code: "UNAUTHENTICATED", message: "A valid sign-in session is required." } });
  }
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anonKey) {
    return json(503, { error: { code: "SERVER_CONFIGURATION", message: "Supabase server configuration is incomplete." } });
  }

  try {
    const client = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const token = authorization.slice("Bearer ".length);
    const { data: authData, error: authError } = await client.auth.getUser(token);
    if (authError || !authData.user) {
      return json(401, { error: { code: "UNAUTHENTICATED", message: "The sign-in session is invalid or expired." } });
    }
    const user = authData.user;
    const body = await req.json();
    const action = body?.action;
    const workspaceId = body?.workspaceId;
    if (!isUuid(workspaceId)) {
      return json(422, { error: { code: "VALIDATION_ERROR", message: "workspaceId must be a UUID." } });
    }

    if (action === "search") {
      const query = typeof body?.query === "string" ? body.query.trim() : "";
      if (query.length < 1 || query.length > 1000) {
        return json(422, { error: { code: "VALIDATION_ERROR", message: "query must contain 1–1000 characters." } });
      }
      const { data, error } = await client.rpc("search_deus_memories", {
        workspace_id_input: workspaceId,
        query_text: query,
        result_limit: Math.max(1, Math.min(Number(body?.limit) || 8, 20)),
      });
      if (error) return json(400, { error: { code: "MEMORY_SEARCH_FAILED", message: "Could not search saved memory." } });
      return json(200, { memories: data ?? [] });
    }

    if (action === "list") {
      const { data, error } = await client.from("memory_items")
        .select("id, category, title, content, sensitivity, visibility, created_at, updated_at")
        .eq("workspace_id", workspaceId)
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(100);
      if (error) return json(400, { error: { code: "MEMORY_LIST_FAILED", message: "Could not list saved memory." } });
      return json(200, { memories: data ?? [] });
    }

    if (action === "save") {
      const category = body?.category;
      const title = typeof body?.title === "string" ? body.title.trim() : "";
      const content = typeof body?.content === "string" ? body.content.trim() : "";
      const sensitivity = body?.sensitivity ?? "NORMAL";
      const visibility = body?.visibility ?? "PRIVATE";
      if (!["PREFERENCE", "PROJECT", "FACT", "CONVERSATION_SUMMARY"].includes(category) ||
          !title || title.length > 160 || !content || content.length > 8000 ||
          !["NORMAL", "PRIVATE"].includes(sensitivity) ||
          !["PRIVATE", "WORKSPACE"].includes(visibility)) {
        return json(422, { error: { code: "VALIDATION_ERROR", message: "Invalid memory category, title, content, sensitivity, or visibility." } });
      }
      const { data, error } = await client.from("memory_items").insert({
        workspace_id: workspaceId,
        user_id: user.id,
        category,
        title,
        content,
        sensitivity,
        visibility,
      }).select("id, category, title, content, sensitivity, visibility, created_at").single();
      if (error || !data) return json(403, { error: { code: "MEMORY_SAVE_DENIED", message: "Could not save this memory." } });
      return json(201, { memory: data });
    }

    if (action === "delete") {
      const memoryId = body?.memoryId;
      if (!isUuid(memoryId)) {
        return json(422, { error: { code: "VALIDATION_ERROR", message: "memoryId must be a UUID." } });
      }
      const { data, error } = await client.from("memory_items").delete()
        .eq("id", memoryId)
        .eq("workspace_id", workspaceId)
        .eq("user_id", user.id)
        .select("id")
        .maybeSingle();
      if (error) return json(400, { error: { code: "MEMORY_DELETE_FAILED", message: "Could not delete this memory." } });
      if (!data) return json(404, { error: { code: "MEMORY_NOT_FOUND", message: "Memory item was not found." } });
      return json(200, { deleted: true, id: data.id });
    }

    return json(422, { error: { code: "VALIDATION_ERROR", message: "action must be search, list, save, or delete." } });
  } catch (error) {
    console.error("deus-memory failed", error instanceof Error ? error.message : "unknown error");
    return json(500, { error: { code: "INTERNAL_ERROR", message: "The memory request could not be completed." } });
  }
});

