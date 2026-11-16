"use client";
import { useEffect, useState } from "react";
import { api, errorMessage } from "../../../lib/api";
import { useAuth } from "../../../components/AuthProvider";
import { Alert, Button, Card, Input, Select, Textarea } from "../../../components/ui";
export default function Page() {
    const { user } = useAuth();
    const [courses, setCourses] = useState<{
        id: number;
        title: string;
        code: string;
        role: string;
    }[]>([]), [message, setMessage] = useState("");
    useEffect(() => { api<{
        courses: typeof courses;
    }>("/api/courses").then(d => setCourses(d.courses.filter(c => c.role === "teacher" || c.role === "admin"))).catch(e => setMessage(errorMessage(e))); }, []);
    if (user?.role !== "teacher" && user?.role !== "admin")
        return <Alert tone="danger">Bạn không có quyền điều chỉnh điểm.</Alert>;
    return <Card title="Điều chỉnh điểm sinh viên">
    <p className="mb-4">Điểm cộng hoặc trừ được ghi thành dòng mới trong sổ cái mùa đang hoạt động, chỉ áp dụng cho lớp được chọn. Giảng viên chỉ điều chỉnh sinh viên thuộc lớp mình quản lý.</p>{message && <Alert>{message}</Alert>}<form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget); try {
        await api("/api/rank/adjustments", { method: "POST", body: Object.fromEntries(f) });
        setMessage("Đã ghi điều chỉnh.");
    }
    catch (err) {
        setMessage(errorMessage(err));
    } }}>
    <Select aria-label="Lớp học" name="courseId" required defaultValue=""><option value="" disabled>Chọn lớp học</option>{courses.map(c => <option key={c.id} value={c.id}>{c.title} · {c.code}</option>)}</Select>
    <Input name="studentId" placeholder="Mã sinh viên 10 số" pattern="[0-9]{10}" required/>
    <Input name="points" type="number" step="any" placeholder="Điểm cộng/trừ" required/>
    <Textarea name="reason" placeholder="Lý do bắt buộc" maxLength={255} required/>
    <Button type="submit">Ghi điều chỉnh</Button>
    </form>
    </Card>;
}
