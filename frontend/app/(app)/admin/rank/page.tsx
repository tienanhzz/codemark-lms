"use client";
import { useI18n } from "../../../../components/LanguageProvider";

import { FormEvent, useEffect, useState } from "react";
import { api, errorMessage } from "../../../../lib/api";
import { useAuth } from "../../../../components/AuthProvider";
import { Alert, Button, Card, Field, Input, Textarea } from "../../../../components/ui";
type Tier = {
    name: string;
    threshold: number;
};
export default function Page() {
  const { tr, locale } = useI18n();
    const { user } = useAuth();
    const [config, setConfig] = useState<any>(null), [tiers, setTiers] = useState<Tier[]>([]), [mask, setMask] = useState(true), [ledger, setLedger] = useState<any[]>([]), [offset, setOffset] = useState(0), [message, setMessage] = useState("");
    async function load() { try {
        const [c, l] = await Promise.all([api<any>("/api/rank/config"), api<any>(`/api/rank/ledger?offset=${offset}`)]);
        setConfig(c);
        setTiers(c.tiers);
        setMask(c.maskCodes);
        setLedger(l.entries);
    }
    catch (e) {
        setMessage(errorMessage(e));
    } }
    useEffect(() => { if (user?.role === "admin")
        load(); }, [user?.role, offset]);
    async function act(path: string, body: unknown, method = "POST") { try {
        await api(path, { method, body });
        setMessage("Đã lưu.");
        window.dispatchEvent(new Event("lms:points"));
        await load();
    }
    catch (e) {
        setMessage(errorMessage(e));
    } }
    function season(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const f = new FormData(e.currentTarget); act("/api/rank/seasons", { name: f.get("name"), startsAt: new Date(String(f.get("startsAt"))).toISOString(), endsAt: new Date(String(f.get("endsAt"))).toISOString(), active: true }); }
    if (user?.role !== "admin")
        return <Alert tone="danger">{tr("Chỉ quản trị viên được sử dụng.")}</Alert>;
    return <div className="space-y-5">
    <h1 className="text-2xl font-bold">{tr("Quản lý mùa và xếp hạng")}</h1>{message && <Alert>{message}</Alert>}<Card title={tr("Tạo mùa")}>
    <form onSubmit={season} className="space-y-3">
    <Field label={tr("Tên mùa")}>
    <Input name="name" required/>
    </Field>
    <Field label={tr("Bắt đầu")}>
    <Input name="startsAt" type="datetime-local" required/>
    </Field>
    <Field label={tr("Kết thúc")}>
    <Input name="endsAt" type="datetime-local" required/>
    </Field>
    <Button type="submit">{tr("Tạo và kích hoạt")}</Button>
    </form>
    <ul>{config?.seasons.map((s: any) => <li key={s.id} className="my-3">{s.name} · {s.active ? tr("Đang hoạt động") : tr("Đã đóng")} <Button size="sm" disabled={s.active} onClick={() => act(`/api/rank/seasons/${s.id}/activate`, {})}>{tr("Kích hoạt")}</Button>
        </li>)}</ul>
    </Card>
    <Card title={tr("Tier và ngưỡng điểm")}>
    <p className="mb-3 text-sm">{tr("Dòng đầu bắt đầu từ 0. Ngưỡng không âm, tăng dần; tên không trùng.")}</p>{tiers.map((t, i) => <div key={i} className="mb-2 flex gap-2">
        <Input aria-label={tr("Tên tier")} value={t.name} onChange={e => setTiers(tiers.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}/>
        <Input aria-label={tr("Ngưỡng")} type="number" min="0" value={t.threshold} onChange={e => setTiers(tiers.map((x, j) => j === i ? { ...x, threshold: Number(e.target.value) } : x))}/>
        <Button variant="secondary" onClick={() => setTiers(tiers.filter((_, j) => j !== i))}>{tr("Bỏ")}</Button>
        </div>)}<Button variant="secondary" onClick={() => setTiers([...tiers, { name: "Tier mới", threshold: (tiers.at(-1)?.threshold || 0) + 100 }])}>{tr("Thêm tier")}</Button>
    <label className="my-3 block">
    <input type="checkbox" checked={mask} onChange={e => setMask(e.target.checked)}/>{" " + tr("Che giữa mã sinh viên")}</label>
    <Button onClick={() => act("/api/rank/tiers", { tiers, maskCodes: mask }, "PUT")}>{tr("Lưu cấu hình")}</Button>
    </Card>
    <Card title={tr("Điều chỉnh điểm")}>
    <form className="space-y-3" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); act("/api/rank/adjustments", Object.fromEntries(f)); }}>
    <Input name="studentId" placeholder={tr("Mã sinh viên 10 số")} pattern="[0-9]{10}" required/>
    <Input name="points" type="number" step="any" placeholder={tr("Điểm cộng/trừ")} required/>
    <Textarea name="reason" placeholder={tr("Lý do bắt buộc")} required maxLength={255}/>
    <Button type="submit">{tr("Ghi điều chỉnh vào sổ cái")}</Button>
    </form>
    </Card>
    <Card title={tr("Sổ cái điểm (chỉ thêm)")}>
    <div className="overflow-x-auto">
    <table className="w-full text-left text-xs">
    <thead>
    <tr>{["ID", tr("ID sinh viên"), tr("Mùa"), tr("Nguồn"), tr("Điểm"), tr("Lý do"), tr("Người ghi"), tr("Dates")].map(s => <th key={s}>{s}</th>)}</tr>
    </thead>
    <tbody>{ledger.map(e => <tr key={e.id}>
        <td>{e.id}</td>
        <td>{e.studentId}</td>
        <td>{e.seasonId}</td>
        <td>{e.sourceType} #{e.sourceId}</td>
        <td>{e.points}</td>
        <td>{e.reason}</td>
        <td>{e.createdBy}</td>
        <td>{new Date(e.createdAt).toLocaleString(locale)}</td>
        </tr>)}</tbody>
    </table>
    </div>
    <Button disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 100))}>{tr("Trước")}</Button>
    <Button disabled={ledger.length < 100} onClick={() => setOffset(offset + 100)}>{tr("Sau")}</Button>
    </Card>
    </div>;
}
