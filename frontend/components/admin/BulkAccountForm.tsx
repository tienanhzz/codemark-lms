"use client";
import { useState } from "react";
import { api, errorMessage } from "../../lib/api";
import { useAuth } from "../AuthProvider";
import { Alert, Button, Card } from "../ui";
type Row = {
    line: number;
    studentId: string;
    status: string;
    valid: boolean;
};
type Report = {
    rows: Row[];
    valid: number;
    created: number;
};
function saveCsv(text: string, name: string) { const url = URL.createObjectURL(new Blob(["\uFEFF" + text], { type: "text/csv;charset=utf-8" })); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url); }
export function BulkAccountForm({ onCreated }: { onCreated: () => Promise<void> }) {
    const { user } = useAuth();
    const [csv, setCsv] = useState(""), [report, setReport] = useState<Report | null>(null), [reset, setReset] = useState(false), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
    async function process(text: string, commit = false, resetExisting = reset) { setBusy(true); try {
        const d = await api<Report>("/api/admin/bulk-accounts", { method: "POST", body: { csv: text, commit, resetExisting } });
        setReport(d);
        setMessage(commit ? `Đã tạo/đặt lại ${d.created} tài khoản. Các dòng khác được bỏ qua.` : "");
        if (commit) {
            setCsv("");
            await onCreated();
        }
    }
    catch (e) {
        setMessage(errorMessage(e));
        setReport(null);
    }
    finally {
        setBusy(false);
    } }
    async function file(f?: File) { if (!f)
        return; if (!f.name.toLowerCase().endsWith(".csv") || f.size > 1048576) {
        setMessage("Chỉ nhận CSV UTF-8, tối đa 1 MiB và 1000 dòng.");
        return;
    } const text = await f.text(); setCsv(text); await process(text); }
    if (user?.role !== "admin")
        return <Alert tone="danger">Chỉ quản trị viên được sử dụng.</Alert>;
    return <div className="space-y-4">
    <Card title="Tạo tài khoản hàng loạt" subtitle="CSV UTF-8, 2 cột studentId,password. Mật khẩu 12–72 byte. Tất cả tài khoản phải đổi mật khẩu lần đầu.">
    <Button onClick={() => saveCsv("studentId,password\n2025999999,MatKhauMau@2026\n", "tai-khoan-mau.csv")}>Tải file mẫu</Button>
    <div className="my-4 rounded-xl border-2 border-dashed border-teal-500 p-12 text-center" tabIndex={0} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); file(e.dataTransfer.files[0]); }}>Kéo thả file CSV vào đây</div>
    <label className="block text-sm">Hoặc chọn file khi không thể kéo thả<input type="file" accept=".csv" onChange={e => file(e.target.files?.[0])}/>
    </label>
    <label className="my-3 block">
    <input type="checkbox" checked={reset} onChange={e => { setReset(e.target.checked); if (csv)
        process(csv, false, e.target.checked); }}/> Đặt lại mật khẩu tài khoản sinh viên đã tồn tại</label>{message && <Alert>{message}</Alert>}{report && <>
        <table className="my-4 w-full text-left text-sm">
        <thead>
        <tr>
        <th>Dòng</th>
        <th>Mã đăng nhập</th>
        <th>Trạng thái</th>
        </tr>
        </thead>
        <tbody>{report.rows.map(r => <tr key={r.line}>
            <td>{r.line}</td>
            <td>{r.studentId}</td>
            <td>{r.status}</td>
            </tr>)}</tbody>
        </table>
        <Button disabled={!csv || !report.valid || busy} onClick={() => process(csv, true)}>Tạo {report.valid} tài khoản</Button>
        <Button variant="secondary" onClick={() => saveCsv("line,studentId,error\n" + report.rows.filter(r => !r.valid).map(r => `${r.line},${/^[0-9]{10}$/.test(r.studentId) ? r.studentId : "khong-hop-le"},${r.status}`).join("\n"), "dong-loi.csv")}>Tải CSV dòng lỗi</Button>
        </>}</Card>
    </div>;
}
