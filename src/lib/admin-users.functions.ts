/**
 * Server functions for admin user management.
 * IMPORTANT: this file must contain ONLY createServerFn declarations and their
 * imports — keeping helpers inline so the client.server import does not leak
 * into client bundles via Vite's splitter.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(userId: string) {
  const { data: meRole } = await supabaseAdmin
    .from("user_roles").select("role").eq("user_id", userId).maybeSingle();
  if (meRole?.role !== "admin") throw new Response("Forbidden", { status: 403 });
}

async function purgeUser(uid: string) {
  const steps = [
    supabaseAdmin.from("test_submissions").delete().eq("student_id", uid),
    supabaseAdmin.from("enrollments").delete().eq("student_id", uid),
    supabaseAdmin.from("class_teachers").delete().eq("teacher_id", uid),
    supabaseAdmin.from("submissions").delete().eq("student_id", uid),
    supabaseAdmin.from("attendance").delete().or(`student_id.eq.${uid},teacher_id.eq.${uid}`),
    supabaseAdmin.from("test_scores").delete().eq("student_id", uid),
    supabaseAdmin.from("mcq_attempts").delete().eq("student_id", uid),
    supabaseAdmin.from("student_documents").delete().eq("student_id", uid),
    supabaseAdmin.from("allowed_identifiers").update({ used_by: null }).eq("used_by", uid),
    supabaseAdmin.from("timetable_slots").update({ teacher_id: null }).eq("teacher_id", uid),
    supabaseAdmin.from("user_roles").delete().eq("user_id", uid),
    supabaseAdmin.from("profiles").delete().eq("id", uid),
  ];
  const errors: string[] = [];
  for (const step of steps) {
    const { error } = await step;
    if (error) errors.push(error.message);
  }
  const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(uid);
  if (authError && authError.status !== 404) errors.push(authError.message);
  if (errors.length) throw new Error(errors.join("; "));
}

/** Delete one user account (used when admin removes a Roll No / Staff ID). */
export const deleteUserAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await purgeUser(data.userId);
    return { ok: true };
  });

/** Delete every non-admin auth account (admin "reset" tool). */
export const resetNonAdminAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id, role");
    const targets = Array.from(new Set((roles ?? []).filter((r) => r.role !== "admin").map((r) => r.user_id)));
    let removed = 0;
    for (const uid of targets) {
      try {
        await purgeUser(uid);
        removed++;
      } catch (e) { console.error("purge failed", uid, e); }
    }
    return { removed };
  });
