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
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceRoleKey) {
    return json(503, { error: { code: "SERVER_CONFIGURATION", message: "Supabase server configuration is incomplete." } });
  }

  try {
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const token = authorization.slice("Bearer ".length);
    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !authData.user) {
      return json(401, { error: { code: "UNAUTHENTICATED", message: "The sign-in session is invalid or expired." } });
    }
    const user = authData.user;
    const body = await req.json();
    const action = body?.action;

    const adminClient = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (action === "propose") {
      const workspaceId = body?.workspaceId;
      const capability = typeof body?.capability === "string" ? body.capability.trim() : "";
      const command = typeof body?.command === "string" ? body.command.trim() : "";
      const args = body?.arguments ?? {};
      if (!isUuid(workspaceId) || capability.length < 1 || capability.length > 100 ||
          command.length < 1 || command.length > 160 || !args ||
          typeof args !== "object" || Array.isArray(args) ||
          JSON.stringify(args).length > 8000) {
        return json(422, { error: { code: "VALIDATION_ERROR", message: "Invalid workspace, capability, command, or arguments." } });
      }

      const { data: permission, error: permissionError } = await userClient
        .from("action_permissions")
        .select("permission_level")
        .eq("workspace_id", workspaceId)
        .eq("user_id", user.id)
        .eq("capability", capability)
        .maybeSingle();
      if (permissionError) {
        return json(403, { error: { code: "PERMISSION_LOOKUP_FAILED", message: "Could not verify this capability." } });
      }
      if (permission?.permission_level === "BLOCKED") {
        return json(403, { error: { code: "CAPABILITY_BLOCKED", message: "This capability is blocked in your permissions." } });
      }

      const { data: request, error: insertError } = await userClient
        .from("system_command_requests")
        .insert({
          workspace_id: workspaceId,
          user_id: user.id,
          capability,
          command,
          arguments: args,
          status: "PROPOSED",
        })
        .select("id, workspace_id, capability, command, arguments, status, created_at")
        .single();
      if (insertError || !request) {
        return json(403, { error: { code: "COMMAND_PROPOSAL_DENIED", message: "Could not create this command proposal." } });
      }

      await adminClient.from("action_audit_log").insert({
        workspace_id: workspaceId,
        user_id: user.id,
        capability,
        action_summary: "Proposed command: " + command,
        outcome: "PROPOSED",
        metadata: { request_id: request.id },
      });

      return json(201, { request, requiresApproval: true, executed: false });
    }

    if (action === "approve" || action === "deny") {
      const requestId = body?.requestId;
      if (!isUuid(requestId)) {
        return json(422, { error: { code: "VALIDATION_ERROR", message: "requestId must be a UUID." } });
      }
      const { data: existing, error: lookupError } = await userClient
        .from("system_command_requests")
        .select("id, workspace_id, user_id, capability, command, status")
        .eq("id", requestId)
        .eq("user_id", user.id)
        .single();
      if (lookupError || !existing) {
        return json(404, { error: { code: "REQUEST_NOT_FOUND", message: "Command request was not found." } });
      }
      if (existing.status !== "PROPOSED") {
        return json(409, { error: { code: "INVALID_REQUEST_STATE", message: "Only proposed commands can be approved or denied." } });
      }

      const nextStatus = action === "approve" ? "APPROVED" : "DENIED";
      const approvalReference = action === "approve" ? crypto.randomUUID() : null;
      const { data: updated, error: updateError } = await adminClient
        .from("system_command_requests")
        .update({ status: nextStatus, approval_reference: approvalReference, updated_at: new Date().toISOString() })
        .eq("id", requestId)
        .eq("user_id", user.id)
        .eq("status", "PROPOSED")
        .select("id, workspace_id, capability, command, status, approval_reference, updated_at")
        .maybeSingle();

      if (updateError || !updated) {
        return json(409, { error: { code: "REQUEST_ALREADY_HANDLED", message: "This command request was already handled." } });
      }

      await adminClient.from("action_audit_log").insert({
        workspace_id: existing.workspace_id,
        user_id: user.id,
        capability: existing.capability,
        action_summary: (action === "approve" ? "Approved command: " : "Denied command: ") + existing.command,
        outcome: nextStatus,
        approval_reference: approvalReference,
        metadata: { request_id: requestId },
      });

      return json(200, { request: updated, executed: false, message: action === "approve"
        ? "Approved. No device or operating-system action has been executed by this endpoint."
        : "Command denied. No action was executed." });
    }

    return json(422, { error: { code: "VALIDATION_ERROR", message: "action must be propose, approve, or deny." } });
  } catch (error) {
    console.error("deus-command failed", error instanceof Error ? error.message : "unknown error");
    return json(500, { error: { code: "INTERNAL_ERROR", message: "The command request could not be completed." } });
  }
});

