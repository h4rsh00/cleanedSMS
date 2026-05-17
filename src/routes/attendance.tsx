import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RequireAuth, useAuth, fetchProfilesByIds, fetchTeacherProfilesByIds, formatDate, formatBatch } from "@/lib/app";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export const Route = createFileRoute("/attendance")({
  head: () => ({ meta: [{ title: "Attendance - College Portal" }] }),
  component: () => <RequireAuth><Attendance /></RequireAuth>,
});

const STATUSES = ["present", "absent", "late"] as const;
type Status = typeof STATUSES[number];

function Attendance() {
  const { user, role } = useAuth();
  const [classes, setClasses] = useState<any[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [roster, setRoster] = useState<string[]>([]);
  const [profMap, setProfMap] = useState<Map<string, any>>(new Map());
  const [marks, setMarks] = useState<Record<string, Status>>({});
  const [history, setHistory] = useState<any[]>([]);
  const [batchMap, setBatchMap] = useState<Map<string, string>>(new Map());
  const [teacherMap, setTeacherMap] = useState<Map<string, any>>(new Map());
  // Teacher analytics
  const [pendingClasses, setPendingClasses] = useState<any[]>([]);
  const [perStudent, setPerStudent] = useState<Map<string, { total: number; present: number; pct: number }>>(new Map());
  // Today's timetable slots for the signed-in teacher (drives the
  // "Today's classes" quick-mark UI).
  const [todaySlots, setTodaySlots] = useState<any[]>([]);
  // Student-only "Subject - Teacher" picker, mirrors grades/assignments.
  const [studentOptions, setStudentOptions] = useState<
    { value: string; label: string; classId: string; teacherId: string }[]
  >([]);
  const [studentFilter, setStudentFilter] = useState<string>("");

  // Show only the batch label (e.g. "B.Tech CSE · Sem 1 · Sec A").
  const labelFor = (c: any) =>
    (c?.batch_id && batchMap.get(c.batch_id)) || c?.name || "-";

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data: bs } = await supabase.from("batches").select("id, program, semester, section");
      setBatchMap(new Map((bs ?? []).map((b: any) => [b.id, formatBatch(b)])));
      if (role === "teacher") {
        // Teacher classes = own + classes the admin assigned them to.
        const [{ data: own }, { data: extra }] = await Promise.all([
          supabase.from("classes").select("*").eq("teacher_id", user.id),
          supabase.from("class_teachers").select("class_id").eq("teacher_id", user.id),
        ]);
        const extraIds = ((extra ?? []) as any[]).map((r) => r.class_id);
        const merged = new Map<string, any>();
        for (const c of (own ?? []) as any[]) merged.set(c.id, c);
        if (extraIds.length) {
          const { data: more } = await supabase.from("classes").select("*").in("id", extraIds);
          for (const c of (more ?? []) as any[]) merged.set(c.id, c);
        }
        const data = Array.from(merged.values());
        setClasses(data);
        if (data[0]) setSelected(data[0].id);
        // pending today
        const today = new Date().toISOString().slice(0, 10);
        const ids = data.map((c) => c.id);
        if (ids.length) {
          const { data: att } = await supabase.from("attendance").select("class_id").eq("session_date", today).in("class_id", ids);
          const taken = new Set((att ?? []).map((a) => a.class_id));
          setPendingClasses(data.filter((c) => !taken.has(c.id)));
        }
        // Pull today's timetable slots assigned to this teacher.
        // JS Date.getDay(): Sun=0..Sat=6. Our DB uses Mon=1..Sat=6.
        const dow = new Date().getDay();
        const dbDay = dow === 0 ? 7 : dow;
        const { data: slots } = await supabase
          .from("timetable_slots")
          .select("id, class_id, subject, room, start_time, end_time")
          .eq("teacher_id", user.id)
          .eq("day_of_week", dbDay)
          .order("start_time");
        setTodaySlots(slots ?? []);
      } else {
        const { data: enr } = await supabase.from("enrollments").select("class_id").eq("student_id", user.id);
        const ids = (enr ?? []).map((e) => e.class_id);
        if (ids.length) {
          const { data } = await supabase.from("classes").select("*").in("id", ids);
          setClasses(data ?? []);
          if (data?.[0]) setSelected(data[0].id);
          // Build "Subject - Teacher" options for the student picker.
          const { data: cts } = await supabase
            .from("class_teachers").select("class_id, teacher_id, subject").in("class_id", ids);
          const tIds = Array.from(new Set([
            ...((data ?? []) as any[]).map((c) => c.teacher_id).filter(Boolean),
            ...((cts ?? []) as any[]).map((r) => r.teacher_id),
          ]));
          const profs = tIds.length ? await fetchTeacherProfilesByIds(tIds) : new Map();
          const opts: { value: string; label: string; classId: string; teacherId: string }[] = [];
          for (const c of (data ?? []) as any[]) {
            if (c.teacher_id && profs.has(c.teacher_id)) {
              const tn = (profs.get(c.teacher_id) as any)?.full_name || "Teacher";
              opts.push({ value: `${c.id}::${c.teacher_id}`, label: `${c.name} - ${tn}`, classId: c.id, teacherId: c.teacher_id });
            }
            for (const ct of ((cts ?? []) as any[]).filter((x) => x.class_id === c.id)) {
              if (!profs.has(ct.teacher_id)) continue;
              const tn = (profs.get(ct.teacher_id) as any)?.full_name || "Teacher";
              opts.push({ value: `${c.id}::${ct.teacher_id}`, label: `${ct.subject || c.name} - ${tn}`, classId: c.id, teacherId: ct.teacher_id });
            }
          }
          setStudentOptions(opts);
          if (opts[0]) { setStudentFilter(opts[0].value); setSelected(opts[0].classId); }
        }
      }
    })();
  }, [user, role]);

  // Whenever the class list updates, fetch teacher profiles for them.
  useEffect(() => {
    const ids = Array.from(new Set(classes.map((c) => c.teacher_id).filter(Boolean)));
    if (!ids.length) return;
    void fetchProfilesByIds(ids).then(setTeacherMap);
  }, [classes]);

  useEffect(() => {
    if (!selected || !user) return;
    void (async () => {
      if (role === "teacher") {
        const { data: enr } = await supabase.from("enrollments").select("student_id").eq("class_id", selected);
        const ids = (enr ?? []).map((e) => e.student_id);
        setRoster(ids);
        setProfMap(await fetchProfilesByIds(ids));
        // Only this teacher's marks for the day (others teaching same batch
        // mark independently for their own subject).
        const { data: existing } = await supabase.from("attendance")
          .select("*").eq("class_id", selected).eq("session_date", date).eq("teacher_id", user.id);
        const m: Record<string, Status> = {};
        ids.forEach((i) => { m[i] = (existing?.find((e) => e.student_id === i)?.status as Status) || "present"; });
        setMarks(m);
        // per-student attendance % across all dates for THIS teacher's sessions.
        const { data: all } = await supabase.from("attendance")
          .select("student_id, status").eq("class_id", selected).eq("teacher_id", user.id);
        const stats = new Map<string, { total: number; present: number; pct: number }>();
        ids.forEach((sid) => stats.set(sid, { total: 0, present: 0, pct: 0 }));
        (all ?? []).forEach((r: any) => {
          const s = stats.get(r.student_id);
          if (!s) return;
          s.total++; if (r.status !== "absent") s.present++;
        });
        stats.forEach((v) => { v.pct = v.total ? Math.round((v.present / v.total) * 100) : 0; });
        setPerStudent(stats);
      } else {
        // Student: filter by the chosen teacher so they see attendance per
        // subject (one batch can have several teachers).
        let q = supabase.from("attendance").select("*").eq("class_id", selected).eq("student_id", user.id);
        const tid = studentFilter.split("::")[1];
        if (tid) q = q.eq("teacher_id", tid);
        const { data } = await q.order("session_date", { ascending: false });
        setHistory(data ?? []);
      }
    })();
  }, [selected, date, user, role, studentFilter]);

  const save = async () => {
    const rows = Object.entries(marks).map(([student_id, status]) => ({
      class_id: selected, student_id, session_date: date, status,
      teacher_id: user!.id,
    }));
    // Note: existing unique index is on (class_id, student_id, session_date).
    // We delete this teacher's prior rows for the day first so multiple
    // teachers can each save their own session without colliding.
    await supabase.from("attendance")
      .delete().eq("class_id", selected).eq("session_date", date).eq("teacher_id", user!.id);
    const { error } = await supabase.from("attendance").insert(rows);
    if (error) return toast.error(error.message);
    toast.success("Attendance saved");
    setPendingClasses((prev) => prev.filter((c) => c.id !== selected));
  };

  const stats = (() => {
    const total = history.length;
    const present = history.filter((h) => h.status !== "absent").length;
    return { total, present, pct: total ? Math.round((present / total) * 100) : 0 };
  })();

  const classAvg = (() => {
    if (perStudent.size === 0) return 0;
    let sum = 0, n = 0;
    perStudent.forEach((v) => { if (v.total) { sum += v.pct; n++; } });
    return n ? Math.round(sum / n) : 0;
  })();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="label-caps">Attendance</div>
          <h1 className="text-2xl font-semibold">{role === "teacher" ? "Mark attendance" : "Your attendance"}</h1>
        </div>
        <div className="flex gap-2 items-end">
          {role === "teacher" ? (
            <select className="rounded-md border border-border bg-input px-3 py-2 text-sm" value={selected} onChange={(e) => setSelected(e.target.value)}>
              {classes.map((c) => <option key={c.id} value={c.id}>{labelFor(c)}</option>)}
            </select>
          ) : (
            // Student: pick "Subject - Teacher" to see attendance for that pair.
            <select
              className="rounded-md border border-border bg-input px-3 py-2 text-sm"
              value={studentFilter}
              onChange={(e) => {
                setStudentFilter(e.target.value);
                const opt = studentOptions.find((o) => o.value === e.target.value);
                if (opt) setSelected(opt.classId);
              }}
            >
              {studentOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}
          {role === "teacher" && (
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
          )}
        </div>
      </div>

      {classes.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">No classes.</Card>
      ) : role === "teacher" ? (
        <>
          {todaySlots.length > 0 && (
            // Quick-jump panel: today's timetable for this teacher. Picking a
            // slot preselects its class and snaps the date to today so the
            // teacher can mark attendance straight from their schedule.
            <Card className="p-4">
              <div className="label-caps">Today's classes (from timetable)</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {todaySlots.map((s) => (
                  <Button key={s.id} size="sm" variant={selected === s.class_id ? "default" : "outline"}
                    onClick={() => { setSelected(s.class_id); setDate(new Date().toISOString().slice(0,10)); }}>
                    {s.start_time?.slice(0,5)} {s.subject || labelFor(classes.find((c) => c.id === s.class_id) || {})}
                    {s.room ? ` · ${s.room}` : ""}
                  </Button>
                ))}
              </div>
            </Card>
          )}
          {pendingClasses.length > 0 && (
            <Card className="p-4 border-destructive/40 bg-destructive/5">
              <div className="label-caps text-destructive">Pending attendance today</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {pendingClasses.map((c) => (
                  <Button key={c.id} size="sm" variant="outline" onClick={() => { setSelected(c.id); setDate(new Date().toISOString().slice(0, 10)); }}>
                    {labelFor(c)}
                  </Button>
                ))}
              </div>
            </Card>
          )}
          <Card className="p-5 grid grid-cols-3 gap-4">
            <div><div className="label-caps">Roster</div><div className="text-2xl font-semibold mt-1">{roster.length}</div></div>
            <div><div className="label-caps">Class avg %</div><div className="text-2xl font-semibold mt-1">{classAvg}%</div></div>
            <div><div className="label-caps">Today</div><div className="text-sm mt-2 text-muted-foreground">{date}</div></div>
          </Card>
          <Card className="p-0 overflow-hidden">
            {roster.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">No students enrolled.</div>
            ) : (
              <>
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs label-caps">
                    <tr><th className="text-left px-4 py-3">Student</th><th className="text-left px-4 py-3">Attendance %</th><th className="text-left px-4 py-3">Today</th></tr>
                  </thead>
                  <tbody>
                    {roster.map((sid) => {
                      const ps = perStudent.get(sid);
                      const low = (ps?.pct ?? 100) < 75;
                      return (
                        <tr key={sid} className="border-t border-border">
                          <td className="px-4 py-3">
                            <Link to="/profile" search={{ id: sid }} className="hover:underline">
                              {profMap.get(sid)?.full_name || "-"}
                            </Link>
                            <div className="text-xs text-muted-foreground">{profMap.get(sid)?.identifier}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={low ? "text-destructive font-medium" : "font-medium"}>
                              {ps?.pct ?? 0}%
                            </span>
                            <span className="text-xs text-muted-foreground ml-2">({ps?.present ?? 0}/{ps?.total ?? 0})</span>
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex gap-1">
                              {STATUSES.map((s) => (
                                <Button
                                  key={s} size="sm"
                                  variant={marks[sid] === s ? "default" : "outline"}
                                  onClick={() => setMarks({ ...marks, [sid]: s })}
                                  className="capitalize"
                                >{s}</Button>
                              ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="border-t border-border p-4 flex justify-end">
                  <Button onClick={save}>Save attendance</Button>
                </div>
              </>
            )}
          </Card>
        </>
      ) : (
        <>
          <Card className="p-5 grid grid-cols-3 gap-4">
            <div><div className="label-caps">Total sessions</div><div className="text-2xl font-semibold mt-1">{stats.total}</div></div>
            <div><div className="label-caps">Present</div><div className="text-2xl font-semibold mt-1">{stats.present}</div></div>
            <div><div className="label-caps">Percentage</div><div className="text-2xl font-semibold mt-1">{stats.pct}%</div></div>
          </Card>
          <Card className="p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs label-caps">
                <tr><th className="text-left px-4 py-3">Date</th><th className="text-left px-4 py-3">Status</th></tr>
              </thead>
              <tbody>
                {history.length === 0 ? (
                  <tr><td colSpan={2} className="px-4 py-6 text-center text-muted-foreground">No records.</td></tr>
                ) : history.map((h) => (
                  <tr key={h.id} className="border-t border-border">
                    <td className="px-4 py-3">{formatDate(h.session_date)}</td>
                    <td className="px-4 py-3 capitalize">{h.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
