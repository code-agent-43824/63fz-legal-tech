import { redirect } from "next/navigation";
import { getCurrentEditorialActor } from "@/lib/auth";
import { withBasePath } from "@/lib/base-path";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function EditorialReviewPage() {
  const actor=await getCurrentEditorialActor(); if(!actor) redirect("/admin/login");
  const ownerWhere=actor.role==="admin"?{}:{authorId:actor.id};
  const reviewerWhere=actor.role==="admin"?{}:{reviewerId:actor.id};
  const [plain,comments,changes]=await Promise.all([
    prisma.plainExplanation.findMany({where:ownerWhere,orderBy:{updatedAt:"desc"},include:{fragment:{select:{id:true,stableId:true,title:true}}}}),
    prisma.expertComment.findMany({where:ownerWhere,orderBy:{updatedAt:"desc"},include:{fragment:{select:{id:true,stableId:true,title:true}}}}),
    prisma.fragmentChangeExplanation.findMany({where:reviewerWhere,orderBy:{updatedAt:"desc"}}),
  ]);
  const rows=[...plain.map(i=>({id:i.id,type:"Объяснение",status:i.status,origin:i.origin,title:i.fragment.title??i.fragment.stableId,href:`/admin/fragments/${i.fragment.id}`})),...comments.map(i=>({id:i.id,type:i.kind==="recommendation"?"Рекомендация":"Комментарий",status:i.status,origin:i.origin,title:i.fragment.title??i.fragment.stableId,href:`/admin/fragments/${i.fragment.id}`})),...changes.map(i=>({id:i.id,type:"Объяснение изменения",status:i.status,origin:i.origin,title:i.stableId,href:`/admin/changes?fromVersionId=${encodeURIComponent(i.fromVersionId)}&toVersionId=${encodeURIComponent(i.toVersionId)}`}))];
  const counts=Object.fromEntries(["draft","in_review","published","unpublished"].map(status=>[status,rows.filter(r=>r.status===status).length]));
  return <main className="min-h-screen bg-stone-50 px-3 py-6 text-slate-950 sm:px-5"><div className="mx-auto max-w-6xl"><a className="text-sm text-slate-600 hover:underline" href={withBasePath("/admin")}>← Админка</a><h1 className="mt-4 text-3xl font-semibold">Редакционная очередь</h1><p className="mt-2 text-sm text-slate-600">{actor.role==="admin"?"Все материалы":"Только ваши материалы и назначенные изменения"}</p><div className="mt-5 flex flex-wrap gap-2">{Object.entries(counts).map(([s,n])=><span className="rounded-full border bg-white px-3 py-1 text-sm" key={s}>{label(s)}: {n}</span>)}<span className="rounded-full border border-violet-300 bg-violet-50 px-3 py-1 text-sm">ИИ: {rows.filter(r=>r.origin==="ai_assisted").length}</span></div><section className="mt-6 overflow-hidden rounded-md border border-slate-200 bg-white">{rows.length===0?<p className="p-5 text-sm text-slate-600">Материалов в очереди пока нет.</p>:rows.map(row=><a className="grid gap-2 border-b border-slate-100 px-4 py-4 text-sm last:border-0 hover:bg-slate-50 md:grid-cols-[160px_130px_120px_minmax(0,1fr)]" href={withBasePath(row.href)} key={`${row.type}-${row.id}`}><strong>{row.type}</strong><span>{label(row.status)}</span><span>{row.origin==="ai_assisted"?"ИИ-черновик":"Авторский"}</span><span className="wrap-anywhere">{row.title}</span></a>)}</section></div></main>;
}
function label(value:string){return({draft:"Черновики",in_review:"На проверке",published:"Опубликовано",unpublished:"Снято"}as Record<string,string>)[value]??value;}
