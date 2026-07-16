import { notFound, redirect } from "next/navigation";
import { getActiveEditorialExperts, getAdminFragmentDetails, type ActiveEditorialExpert } from "@/lib/admin-data";
import { getCurrentEditorialActor } from "@/lib/auth";
import type { EditorialActor } from "@/lib/editorial-policy";
import { withBasePath } from "@/lib/base-path";
import { logoutAdmin } from "../../actions";
import { createContent, deleteContent, publishReviewedContent, submitContentForReview, unpublishContent, updateContent } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminFragmentPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getCurrentEditorialActor();
  if (!actor) redirect("/admin/login");
  const { id } = await params;
  const [fragment, experts] = await Promise.all([getAdminFragmentDetails(id), getActiveEditorialExperts()]);
  if (!fragment) notFound();

  return <main className="min-h-screen bg-stone-50 px-3 py-6 text-slate-950 sm:px-5 sm:py-8"><div className="mx-auto w-full max-w-6xl">
    <div className="flex flex-wrap items-center justify-between gap-3"><a className="text-sm text-slate-600 hover:underline" href={withBasePath("/admin")}>← Все фрагменты</a><form action={logoutAdmin}><button className="h-10 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium">Выйти</button></form></div>
    <div className="mt-4 border-b border-slate-200 pb-6"><p className="wrap-anywhere text-sm uppercase tracking-wide text-slate-500">{fragment.type} · {fragment.stableId}</p><h1 className="wrap-anywhere mt-2 text-3xl font-semibold">{fragment.title}</h1></div>
    <section className="mt-6 rounded-md border border-slate-200 bg-white p-5"><h2 className="text-lg font-semibold">Официальный текст</h2><p className="wrap-anywhere mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{fragment.originalText}</p><p className="mt-4 text-sm text-slate-500">Отделён от редакционных материалов и здесь не редактируется.</p></section>
    <div className="mt-6 grid gap-6">
      <ContributionSection actor={actor} experts={experts} fragmentId={fragment.id} items={fragment.plainExplanations} kind="explanation" title="Простыми словами" />
      <ContributionSection actor={actor} experts={experts} fragmentId={fragment.id} items={fragment.expertComments} kind="comment" title="Экспертные материалы" />
      {actor.role === "admin" ? <IssueSection fragmentId={fragment.id} items={fragment.issues} /> : null}
      {actor.role === "admin" ? <RevisionSection fragmentId={fragment.id} originalText={fragment.originalText} items={fragment.proposedRevisions} /> : null}
    </div>
  </div></main>;
}

type ContributionItem = {
  id: string; text: string; status: string; authorId: string | null; origin: string; sourceLinks: string | null; reviewedAt: Date | null;
  authorName?: string | null; expertName?: string; expertTitle?: string | null; kind?: string;
};

function ContributionSection({ actor, experts, fragmentId, items, kind, title }: { actor: EditorialActor; experts: ActiveEditorialExpert[]; fragmentId: string; items: ContributionItem[]; kind: "explanation" | "comment"; title: string }) {
  const visible = items.filter((item) => actor.role === "admin" || item.authorId === actor.id);
  return <Section title={title}>
    <form action={createContent} className="rounded-md border border-slate-200 bg-slate-50 p-4"><Hidden fragmentId={fragmentId} kind={kind} />
      <div className="grid gap-3">{actor.role === "admin" ? <ExpertSelect experts={experts} /> : <IdentityNote actor={actor} />}{kind === "comment" ? <Select label="Тип" name="contributionKind" options={[{value:"comment",label:"Комментарий эксперта"},{value:"recommendation",label:"Практическая рекомендация"}]} /> : null}<OriginSelect /><TextArea label={kind === "comment" ? "Текст" : "Объяснение"} name="text" required /><TextArea label="Источники (по одному URL в строке)" name="sourceLinks" /></div>
      <button className="mt-4 rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white">Создать непубличный черновик</button>
    </form>
    {visible.map((item) => <article className="rounded-md border border-slate-200 p-4" key={item.id}>
      <Preview item={item} kind={kind} />
      <form action={updateContent}><Hidden fragmentId={fragmentId} id={item.id} kind={kind} /><div className="grid gap-3">{actor.role === "admin" ? <ExpertSelect defaultValue={item.authorId ?? ""} experts={experts} /> : <IdentityNote actor={actor} />}{kind === "comment" ? <Select defaultValue={item.kind ?? "comment"} label="Тип" name="contributionKind" options={[{value:"comment",label:"Комментарий эксперта"},{value:"recommendation",label:"Практическая рекомендация"}]} /> : null}<OriginSelect defaultValue={item.origin} /><TextArea defaultValue={item.text} label="Текст" name="text" required /><TextArea defaultValue={item.sourceLinks ?? ""} label="Источники (по одному URL в строке)" name="sourceLinks" /></div><p className="mt-3 text-xs text-amber-800">Сохранение всегда возвращает материал в черновик и отменяет предыдущую проверку.</p><button className="mt-3 rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white">Сохранить как черновик</button></form>
      <Workflow actor={actor} fragmentId={fragmentId} item={item} kind={kind} />
      {actor.role === "admin" ? <form action={deleteContent} className="mt-3"><Hidden fragmentId={fragmentId} id={item.id} kind={kind} /><label className="flex gap-2 text-sm text-slate-600"><input name="confirmDelete" type="checkbox" value="yes" />Подтверждаю удаление</label><button className="mt-2 text-sm text-red-700 hover:underline">Удалить</button></form> : null}
    </article>)}
  </Section>;
}

function Workflow({ actor, fragmentId, item, kind }: { actor: EditorialActor; fragmentId: string; item: ContributionItem; kind: string }) {
  const owner = actor.kind === "user" && actor.role === "expert" && actor.id === item.authorId;
  return <div className="mt-4 border-t border-slate-200 pt-4">
    {owner && (item.status === "draft" || item.status === "unpublished") ? <form action={submitContentForReview}><Hidden fragmentId={fragmentId} id={item.id} kind={kind} /><button className="rounded-md border border-slate-400 bg-white px-4 py-2 text-sm font-medium">Передать на проверку</button></form> : null}
    {owner && item.status === "in_review" ? <form action={publishReviewedContent} className="rounded-md border border-emerald-200 bg-emerald-50 p-3"><p className="text-sm font-semibold">Проверка перед публикацией</p><div className="mt-2 grid gap-2">{[["factualAccuracy","Факты и трактовка проверены"],["sources","Источники проверены и достаточны"],["scope","Редакционный текст не выдан за официальный"],["version","Выбрана правильная редакция закона"],["responsibility","Я принимаю именную ответственность за публикацию"]].map(([name,label]) => <label className="flex gap-2 text-sm" key={name}><input name={name} required type="checkbox" value="yes" />{label}</label>)}</div><Hidden fragmentId={fragmentId} id={item.id} kind={kind} /><button className="mt-3 rounded-md bg-emerald-900 px-4 py-2 text-sm font-medium text-white">Опубликовать после проверки</button></form> : null}
    {(actor.role === "admin" || owner) && item.status === "published" ? <form action={unpublishContent}><Hidden fragmentId={fragmentId} id={item.id} kind={kind} /><button className="rounded-md border border-amber-400 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-950">Снять с публикации</button></form> : null}
  </div>;
}

function Preview({ item, kind }: { item: ContributionItem; kind: string }) { const author = kind === "comment" ? `${item.expertName}${item.expertTitle ? ` · ${item.expertTitle}` : ""}` : item.authorName; return <details className="mb-4 rounded-md border border-slate-200 bg-white p-3" open={item.status === "in_review"}><summary className="cursor-pointer text-sm font-medium">Предпросмотр · {statusLabel(item.status)} · {item.origin === "ai_assisted" ? "ИИ-черновик" : "авторский"}</summary><p className="mt-3 text-sm font-medium">{author || "Автор не назначен"}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{item.text}</p>{item.reviewedAt ? <p className="mt-2 text-xs text-slate-500">Проверено: {formatDate(item.reviewedAt)}</p> : null}</details>; }

function IssueSection({fragmentId,items}:{fragmentId:string;items:Array<{id:string;type:string;title:string;description:string;severity:string;status:string}>}) { return <Section title="Ошибки и спорные места"><SimpleForm fragmentId={fragmentId} kind="issue"><IssueFields /></SimpleForm>{items.map(i=><SimpleForm fragmentId={fragmentId} id={i.id} kind="issue" key={i.id}><IssueFields item={i}/></SimpleForm>)}</Section>; }
function RevisionSection({fragmentId,originalText,items}:{fragmentId:string;originalText:string;items:Array<{id:string;originalText:string;proposedText:string;rationale:string;status:string}>}) { return <Section title="Предложенная редакция"><SimpleForm fragmentId={fragmentId} kind="revision"><TextArea defaultValue={originalText} label="Оригинальный текст" name="originalText" required/><TextArea label="Предложенный текст" name="proposedText" required/><TextArea label="Обоснование" name="rationale" required/><Select label="Статус" name="status" options={revisionOptions}/></SimpleForm>{items.map(i=><SimpleForm fragmentId={fragmentId} id={i.id} kind="revision" key={i.id}><TextArea defaultValue={i.originalText} label="Оригинальный текст" name="originalText" required/><TextArea defaultValue={i.proposedText} label="Предложенный текст" name="proposedText" required/><TextArea defaultValue={i.rationale} label="Обоснование" name="rationale" required/><Select defaultValue={i.status} label="Статус" name="status" options={revisionOptions}/></SimpleForm>)}</Section>; }
function SimpleForm({children,fragmentId,id,kind}:{children:React.ReactNode;fragmentId:string;id?:string;kind:string}) { return <form action={id ? updateContent : createContent} className="rounded-md border border-slate-200 bg-slate-50 p-4"><Hidden fragmentId={fragmentId} id={id} kind={kind}/><div className="grid gap-3">{children}</div><button className="mt-3 rounded-md bg-slate-950 px-4 py-2 text-sm text-white">{id?"Сохранить":"Добавить"}</button></form>; }
function IssueFields({item}:{item?:{type:string;title:string;description:string;severity:string;status:string}}) { return <><Select defaultValue={item?.type??"other"} label="Тип" name="type" options={["typo","contradiction","ambiguity","outdated_norm","technical_error","enforcement_problem","other"].map(value=>({value,label:value}))}/><TextInput defaultValue={item?.title} label="Заголовок" name="title" required/><TextArea defaultValue={item?.description} label="Описание" name="description" required/><Select defaultValue={item?.severity??"low"} label="Серьёзность" name="severity" options={["low","medium","high"].map(value=>({value,label:value}))}/><Select defaultValue={item?.status??"hypothesis"} label="Статус" name="status" options={["hypothesis","confirmed","rejected","fixed_in_proposal"].map(value=>({value,label:value}))}/></>; }
const revisionOptions=["draft","proposed","accepted","rejected"].map(value=>({value,label:value}));
function Section({children,title}:{children:React.ReactNode;title:string}) { return <section className="rounded-md border border-slate-200 bg-white p-5"><h2 className="text-lg font-semibold">{title}</h2><div className="mt-4 grid gap-4">{children}</div></section>; }
function Hidden({fragmentId,id,kind}:{fragmentId:string;id?:string;kind:string}) { return <><input name="fragmentId" type="hidden" value={fragmentId}/>{id?<input name="id" type="hidden" value={id}/>:null}<input name="kind" type="hidden" value={kind}/></>; }
function ExpertSelect({experts,defaultValue}:{experts:ActiveEditorialExpert[];defaultValue?:string}) { return <Select defaultValue={defaultValue??""} label="Ответственный эксперт" name="authorId" options={[{value:"",label:"Выберите эксперта"},...experts.map(e=>({value:e.id,label:`${e.displayName}${e.professionalTitle?` · ${e.professionalTitle}`:""}`}))]}/>; }
function OriginSelect({defaultValue="human"}:{defaultValue?:string}) { return <Select defaultValue={defaultValue} label="Происхождение черновика" name="origin" options={[{value:"human",label:"Авторский текст"},{value:"ai_assisted",label:"Подготовлен с помощью ИИ"}]}/>; }
function IdentityNote({actor}:{actor:EditorialActor}) { return <p className="rounded-md border bg-white px-3 py-2 text-sm">Ответственный: <strong>{actor.displayName}</strong>{actor.professionalTitle?` · ${actor.professionalTitle}`:""}</p>; }
function Select({defaultValue,label,name,options}:{defaultValue?:string;label:string;name:string;options:Array<{value:string;label:string}>}) { return <label className="block"><span className="text-sm font-medium text-slate-700">{label}</span><select className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm" defaultValue={defaultValue} name={name}>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>; }
function TextInput({defaultValue,label,name,required}:{defaultValue?:string;label:string;name:string;required?:boolean}) { return <label><span className="text-sm font-medium text-slate-700">{label}</span><input className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm" defaultValue={defaultValue} name={name} required={required}/></label>; }
function TextArea({defaultValue,label,name,required}:{defaultValue?:string;label:string;name:string;required?:boolean}) { return <label><span className="text-sm font-medium text-slate-700">{label}</span><textarea className="mt-1 min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm leading-6" defaultValue={defaultValue} name={name} required={required}/></label>; }
function statusLabel(status:string){return ({draft:"черновик",in_review:"на проверке",published:"опубликовано",unpublished:"снято"} as Record<string,string>)[status]??status;}
function formatDate(date:Date){return new Intl.DateTimeFormat("ru-RU",{dateStyle:"medium",timeStyle:"short",timeZone:"Europe/Moscow"}).format(date);}
