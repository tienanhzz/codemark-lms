"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useAuth } from "../../../../components/AuthProvider";
import { Alert, Button, Card, Field, Input, Select } from "../../../../components/ui";
import { api, errorMessage } from "../../../../lib/api";

type Tag = { id:number; tagId:string; label:string; parentId:string|null; lesson:boolean; codingQuestion:boolean; assignable:boolean; active:boolean; position:number };
const empty = { tagId:"", label:"", parentId:"", lesson:true, codingQuestion:true, assignable:true, active:true, position:0 };

export default function TaxonomyPage() {
  const { user } = useAuth();
  const [tags,setTags]=useState<Tag[]>([]), [draft,setDraft]=useState(empty), [editing,setEditing]=useState<number|null>(null), [message,setMessage]=useState("");
  const load=useCallback(async()=>{try { const data=await api<{tags:Tag[]}>('/api/taxonomy?includeInactive=true'); setTags(data.tags); } catch(e) { setMessage(errorMessage(e)); }},[]);
  useEffect(()=>{ if(user?.role==='admin') void load(); },[user?.role,load]);
  function edit(tag:Tag) { setEditing(tag.id); setDraft({...tag,parentId:tag.parentId||''}); }
  function reset() { setEditing(null); setDraft(empty); }
  async function save(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage("");
    try { await api(editing?`/api/taxonomy/${editing}`:'/api/taxonomy',{method:editing?'PUT':'POST',body:{...draft,parentId:draft.parentId||null}}); setMessage('Đã lưu thẻ.'); reset(); await load(); }
    catch(e) { setMessage(errorMessage(e)); }
  }
  if(user?.role!=='admin') return <Alert tone="danger">Chỉ quản trị viên được sử dụng.</Alert>;
  return <div className="space-y-5">
    <h1 className="text-2xl font-bold">Taxonomy nội dung học tập</h1>
    {message&&<Alert>{message}</Alert>}
    <Card title={editing?'Sửa thẻ':'Thêm thẻ'} subtitle="ID ổn định; có thể dùng chung cho bài học và câu hỏi lập trình.">
      <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
        <Field label="ID thẻ"><Input value={draft.tagId} disabled={editing!==null} pattern="[a-z][a-z0-9-]{0,63}" required onChange={e=>setDraft({...draft,tagId:e.target.value})}/></Field>
        <Field label="Tên hiển thị"><Input value={draft.label} maxLength={100} required onChange={e=>setDraft({...draft,label:e.target.value})}/></Field>
        <Field label="Thẻ cha"><Select value={draft.parentId} onChange={e=>setDraft({...draft,parentId:e.target.value})}><option value="">Không có</option>{tags.filter(t=>t.id!==editing).map(t=><option key={t.id} value={t.tagId}>{t.label} ({t.tagId})</option>)}</Select></Field>
        <Field label="Thứ tự"><Input type="number" min="0" value={draft.position} onChange={e=>setDraft({...draft,position:Number(e.target.value)})}/></Field>
        <div className="flex flex-wrap gap-4 sm:col-span-2">{([['lesson','Bài học'],['codingQuestion','Câu hỏi lập trình'],['assignable','Cho phép gắn'],['active','Đang hoạt động']] as const).map(([key,label])=><label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft[key]} onChange={e=>setDraft({...draft,[key]:e.target.checked})}/>{label}</label>)}</div>
        <div className="flex gap-2 sm:col-span-2"><Button type="submit">Lưu</Button>{editing!==null&&<Button type="button" variant="secondary" onClick={reset}>Hủy sửa</Button>}</div>
      </form>
    </Card>
    <Card title="Danh mục thẻ" subtitle={`${tags.length} thẻ`}>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Tên','ID','Cha','Áp dụng','Trạng thái',''].map(x=><th key={x} className="p-2">{x}</th>)}</tr></thead>
        <tbody>{tags.map(t=><tr key={t.id} className="border-t"><td className="p-2">{t.label}</td><td className="p-2 font-mono text-xs">{t.tagId}</td><td className="p-2">{t.parentId||'—'}</td><td className="p-2">{[t.lesson&&'Bài học',t.codingQuestion&&'Câu hỏi'].filter(Boolean).join(', ')}</td><td className="p-2">{!t.active?'Ngừng hoạt động':t.assignable?'Có thể gắn':'Nhóm'}</td><td className="p-2"><Button type="button" size="sm" variant="secondary" onClick={()=>edit(t)}>Sửa</Button></td></tr>)}</tbody>
      </table></div>
    </Card>
  </div>;
}
