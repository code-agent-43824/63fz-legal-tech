import { redirect } from "next/navigation";
import { getCurrentEditorialActor } from "@/lib/auth";
import { withBasePath } from "@/lib/base-path";
import { MIN_EDITORIAL_PASSWORD_LENGTH } from "@/lib/editorial-password";
import { prisma } from "@/lib/prisma";
import { createExpert, resetExpertPassword, updateExpert } from "./actions";

export const dynamic = "force-dynamic";

export default async function EditorialUsersPage() {
  const actor = await getCurrentEditorialActor();
  if (!actor) redirect("/admin/login");
  if (actor.role !== "admin") redirect("/admin");

  const [users, auditEvents] = await Promise.all([
    prisma.editorialUser.findMany({ where: { role: "expert" }, orderBy: { displayName: "asc" } }),
    prisma.editorialAuditLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
  ]);

  return (
    <main className="min-h-screen bg-stone-50 px-3 py-6 text-slate-950 sm:px-5 sm:py-8">
      <div className="mx-auto w-full max-w-5xl">
        <a className="text-sm text-slate-600 underline-offset-4 hover:underline" href={withBasePath("/admin")}>← Админка</a>
        <h1 className="mt-4 text-3xl font-semibold">Экспертные аккаунты</h1>
        <p className="mt-2 text-sm text-slate-600">Только приглашённые аккаунты. Публичной регистрации нет.</p>

        <section className="mt-6 rounded-md border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Пригласить эксперта</h2>
          <form action={createExpert} className="mt-4 grid gap-3 md:grid-cols-2">
            <Field label="Логин" name="username" required />
            <Field label="Имя для публикации" name="displayName" required />
            <Field label="Должность / описание" name="professionalTitle" />
            <Field label={`Временный пароль (от ${MIN_EDITORIAL_PASSWORD_LENGTH} символов)`} name="password" required type="password" />
            <button className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white md:col-span-2" type="submit">Создать аккаунт</button>
          </form>
        </section>

        <section className="mt-6 grid gap-4">
          {users.map((user) => (
            <article className="rounded-md border border-slate-200 bg-white p-5" key={user.id}>
              <div className="flex flex-wrap justify-between gap-2">
                <div><h2 className="font-semibold">{user.displayName}</h2><p className="text-sm text-slate-600">{user.username} · {user.status}</p></div>
                <p className="text-xs text-slate-500">Последний вход: {user.lastLoginAt ? user.lastLoginAt.toLocaleString("ru-RU") : "ещё не входил"}</p>
              </div>
              <form action={updateExpert} className="mt-4 grid gap-3 md:grid-cols-3">
                <input name="id" type="hidden" value={user.id} />
                <Field defaultValue={user.displayName} label="Имя для публикации" name="displayName" required />
                <Field defaultValue={user.professionalTitle ?? ""} label="Должность / описание" name="professionalTitle" />
                <label className="grid gap-1 text-sm"><span className="font-medium text-slate-700">Статус</span><select className="h-10 rounded-md border border-slate-300 bg-white px-3" defaultValue={user.status} name="status"><option value="active">active</option><option value="disabled">disabled</option></select></label>
                <button className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium md:col-span-3" type="submit">Сохранить профиль</button>
              </form>
              <form action={resetExpertPassword} className="mt-3 flex flex-col gap-3 sm:flex-row">
                <input name="id" type="hidden" value={user.id} />
                <input aria-label="Новый пароль" className="h-10 min-w-0 flex-1 rounded-md border border-slate-300 px-3 text-sm" minLength={MIN_EDITORIAL_PASSWORD_LENGTH} name="password" placeholder="Новый временный пароль" required type="password" />
                <button className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium" type="submit">Сменить пароль</button>
              </form>
            </article>
          ))}
        </section>

        <section className="mt-8 rounded-md border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Последние действия</h2>
          <div className="mt-4 grid gap-2 text-sm">
            {auditEvents.length ? auditEvents.map((event) => (
              <div className="border-b border-slate-100 pb-2" key={event.id}>
                <span className="font-medium">{event.actorName}</span> · {event.action} · {event.entityType}{event.entityId ? ` ${event.entityId}` : ""}
                <span className="ml-2 text-slate-500">{event.createdAt.toLocaleString("ru-RU")}</span>
              </div>
            )) : <p className="text-slate-600">Действий пока нет.</p>}
          </div>
        </section>
      </div>
    </main>
  );
}

function Field({ defaultValue, label, name, required, type = "text" }: { defaultValue?: string; label: string; name: string; required?: boolean; type?: string }) {
  return <label className="grid gap-1 text-sm"><span className="font-medium text-slate-700">{label}</span><input className="h-10 rounded-md border border-slate-300 px-3" defaultValue={defaultValue} name={name} required={required} type={type} /></label>;
}
