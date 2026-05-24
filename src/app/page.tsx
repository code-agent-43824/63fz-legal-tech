const demoFragments = [
  {
    id: "63fz.article_1",
    title: "Статья 1. Сфера действия",
    text: "DEMO DATA: здесь будет неизменяемый официальный текст выбранной версии закона.",
    note: "Пояснение пока не добавлено.",
  },
  {
    id: "63fz.article_2.part_1",
    title: "Статья 2, часть 1. Основные понятия",
    text: "DEMO DATA: фрагмент нужен только для проверки структуры, якорей и двухколоночного интерфейса.",
    note: "Комментариев экспертов пока нет.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-stone-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-5 py-8 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
              DEMO DATA · MVP scaffold
            </p>
            <h1 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight md:text-5xl">
              63-ФЗ об электронной подписи
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
              Структурированный интерфейс для чтения закона, экспертных комментариев,
              спорных мест и предложений новой редакции.
            </p>
          </div>
          <a
            className="inline-flex h-11 items-center justify-center rounded-md bg-slate-950 px-5 text-sm font-medium text-white"
            href="#law"
          >
            Открыть закон
          </a>
        </div>
      </header>

      <section className="mx-auto grid w-full max-w-6xl gap-6 px-5 py-8 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-md border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Оглавление
          </h2>
          <nav className="mt-4 space-y-3">
            {demoFragments.map((fragment) => (
              <a
                className="block rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                href={`#${fragment.id}`}
                key={fragment.id}
              >
                {fragment.title}
              </a>
            ))}
          </nav>
        </aside>

        <div className="space-y-5" id="law">
          {demoFragments.map((fragment) => (
            <article
              className="grid gap-0 overflow-hidden rounded-md border border-slate-200 bg-white lg:grid-cols-2"
              id={fragment.id}
              key={fragment.id}
            >
              <section className="border-b border-slate-200 p-5 lg:border-b-0 lg:border-r">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-semibold">{fragment.title}</h2>
                  <a
                    className="text-sm text-blue-700 underline-offset-4 hover:underline"
                    href={`#${fragment.id}`}
                  >
                    #{fragment.id}
                  </a>
                </div>
                <p className="mt-4 whitespace-pre-wrap text-base leading-7 text-slate-800">
                  {fragment.text}
                </p>
              </section>

              <section className="bg-slate-50 p-5">
                <div className="grid gap-4">
                  <CommentBlock title="Простыми словами" text={fragment.note} />
                  <CommentBlock title="Комментарии экспертов" text="Пока не добавлено." />
                  <CommentBlock title="Ошибки и спорные места" text="Пока не добавлено." />
                  <CommentBlock title="Предложенная редакция" text="Пока не добавлено." />
                </div>
              </section>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function CommentBlock({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
    </div>
  );
}
