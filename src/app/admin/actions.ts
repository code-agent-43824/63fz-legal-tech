"use server";

import { redirect } from "next/navigation";
import { clearAdminSession, getCurrentEditorialActor } from "@/lib/auth";
import { recordEditorialAudit } from "@/lib/editorial-audit";
import { withBasePath } from "@/lib/base-path";

export async function logoutAdmin() {
  const actor = await getCurrentEditorialActor();
  if (actor) {
    await recordEditorialAudit({ actor, action: "session.logout", entityType: "session" });
  }
  await clearAdminSession();
  redirect(withBasePath("/admin/login"));
}
