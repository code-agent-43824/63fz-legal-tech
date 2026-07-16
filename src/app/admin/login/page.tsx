import { redirect } from "next/navigation";
import { headers } from "next/headers";
import {
  checkAdminLoginRateLimit,
  authenticateEditorialUser,
  createAdminSession,
  createEditorialUserSession,
  getAuthConfigurationIssue,
  recordAdminLoginFailure,
  recordAdminLoginSuccess,
  verifyAdminPassword,
} from "@/lib/auth";
import { recordEditorialAudit } from "@/lib/editorial-audit";
import { withBasePath } from "@/lib/base-path";

export const dynamic = "force-dynamic";

export default function AdminLoginPage() {
  async function login(formData: FormData) {
    "use server";

    const username = String(formData.get("username") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    const rateLimitKey = `${await getRateLimitKey()}:${username || "admin"}`;
    const rateLimit = checkAdminLoginRateLimit(rateLimitKey);

    if (!rateLimit.allowed) {
      redirect(withBasePath("/admin/login?error=rate"));
    }

    const isEnvironmentAdmin = !username || username === "admin";
    const editorialUser = isEnvironmentAdmin
      ? null
      : await authenticateEditorialUser(username, password);

    if ((isEnvironmentAdmin && !verifyAdminPassword(password)) || (!isEnvironmentAdmin && !editorialUser)) {
      recordAdminLoginFailure(rateLimitKey);
      redirect(withBasePath("/admin/login?error=1"));
    }

    recordAdminLoginSuccess(rateLimitKey);
    if (editorialUser) {
      await createEditorialUserSession(editorialUser.id);
      await recordEditorialAudit({
        actor: { kind: "user", id: editorialUser.id, role: editorialUser.role, displayName: editorialUser.displayName, professionalTitle: editorialUser.professionalTitle },
        action: "session.login",
        entityType: "session",
      });
    } else {
      await createAdminSession();
      await recordEditorialAudit({
        actor: { kind: "env-admin", id: null, role: "admin", displayName: "Администратор", professionalTitle: null },
        action: "session.login",
        entityType: "session",
      });
    }
    redirect(withBasePath("/admin"));
  }

  return (
    <main className="min-h-screen bg-stone-50 px-5 py-10 text-slate-950">
      <div className="mx-auto w-full max-w-sm rounded-md border border-slate-200 bg-white p-6">
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Админка
        </p>
        <h1 className="mt-3 text-2xl font-semibold">Вход</h1>
        <form action={login} className="mt-6 space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Логин</span>
            <input
              autoComplete="username"
              className="mt-2 h-11 w-full rounded-md border border-slate-300 px-3 text-base outline-none focus:border-slate-950"
              name="username"
              placeholder="admin или логин эксперта"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Пароль</span>
            <input
              className="mt-2 h-11 w-full rounded-md border border-slate-300 px-3 text-base outline-none focus:border-slate-950"
              name="password"
              autoComplete="current-password"
              required
              type="password"
            />
          </label>
          <LoginError />
          <button
            className="inline-flex h-11 w-full items-center justify-center rounded-md bg-slate-950 px-5 text-sm font-medium text-white"
            type="submit"
          >
            Войти
          </button>
        </form>
      </div>
    </main>
  );
}

async function getRateLimitKey() {
  const headerStore = await headers();
  const forwardedFor = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || headerStore.get("x-real-ip") || "unknown";
}

function LoginError() {
  const configurationIssue = getAuthConfigurationIssue();

  return (
    <p className="text-sm text-slate-500">
      {configurationIssue
        ? "Вход заблокирован: административные секреты не настроены безопасно."
        : "После нескольких неудачных попыток вход временно блокируется."}
    </p>
  );
}
