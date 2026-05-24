import { redirect } from "next/navigation";
import { createAdminSession, verifyAdminPassword } from "@/lib/auth";

export default function AdminLoginPage() {
  async function login(formData: FormData) {
    "use server";

    const password = String(formData.get("password") ?? "");

    if (!verifyAdminPassword(password)) {
      redirect("/admin/login?error=1");
    }

    await createAdminSession();
    redirect("/admin");
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
            <span className="text-sm font-medium text-slate-700">Пароль</span>
            <input
              className="mt-2 h-11 w-full rounded-md border border-slate-300 px-3 text-base outline-none focus:border-slate-950"
              name="password"
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

function LoginError() {
  return (
    <p className="text-sm text-slate-500">
      Если пароль не задан в окружении, вход будет заблокирован.
    </p>
  );
}
