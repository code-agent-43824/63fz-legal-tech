"use server";

import { redirect } from "next/navigation";
import { clearAdminSession, getCurrentEditorialActor } from "@/lib/auth";
import { recordEditorialAudit } from "@/lib/editorial-audit";

export async function logoutAdmin() {
  const actor = await getCurrentEditorialActor();
  if (actor) {
    await recordEditorialAudit({ actor, action: "session.logout", entityType: "session" });
  }
  await clearAdminSession();
  redirect("/admin/login");
}
