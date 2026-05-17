import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { RequireAuth, useAuth, formatDateTime, formatBatch, fetchTeacherProfilesByIds } from "@/lib/app";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, FileText, Calendar, Upload, Trash2 } from "lucide-react";

export const Route = createFileRoute("/assignments/")({
  head: () => ({ meta: [{ title: "Assignments - College Portal" }] }),
  component: () => <RequireAuth><AssignmentsList /></RequireAuth>,
});

function AssignmentsList() {
  const { user, role } = useAuth();
  const isTeacher = role === "teacher";
  const [items, setItems] = useState<any[]>([]);
  const [classes, setClasses] = useState<{ id: string; name: string; teacher_id?: string; batch_id?: string | null }[]>([]);
  const [classMap, setClassMap] = useState<Map<string, string>>(new Map());
  // Student filter: "Subject - Teacher" options spanning every (class, teacher).
  const [studentOptions, setStudentOptions] = useState<
    { value: string; label: string; classId: string; teacherId: string }[]
  >([]);
  const [studentFilter, setStudentFilter] = useState<string>(""); // value = `${classId}::${teacherId}`

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ class_id: "", title: "", description: "", due_at: "", max_marks: 100 });
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    if (!user) return;
    let classIds: string[] = [];
    let classList: { id: string; name: string; teacher_id?: string; batch_id?: string | null }[] = [];
    if (isTeacher) {
      // Teacher classes = classes they own + classes admin assigned them to
      const [{ data: own }, { data: extra }] = await Promise.all([
        supabase.from("classes").select("id, name, teacher_id, batch_id").eq("teacher_id", user.id),
        supabase.from("class_teachers").select("class_id").eq("teacher_id", user.id),
      ]);
      const extraIds = ((extra ?? []) as any[]).map((r) => r.class_id);
      const merged = new Map<string, { id: string; name: string; teacher_id?: string; batch_id?: string | null }>();
      for (const c of (own ?? []) as any[]) merged.set(c.id, c);
      if (extraIds.length) {
        const { data: more } = await supabase.from("classes").select("id, name, teacher_id, batch_id").in("id", extraIds);
        for (const c of (more ?? []) as any[]) merged.set(c.id, c);
      }
      classList = Array.from(merged.values());
      classIds = classList.map((c) => c.id);
    } else {
      const { data: enr } = await supabase.from("enrollments").select("class_id").eq("student_id", user.id);
      classIds = (enr ?? []).map((e) => e.class_id);
      if (classIds.length) {
        const { data: cls } = await supabase.from("classes").select("id, name, teacher_id, batch_id").in("id", classIds);
        classList = cls ?? [];
      }
    }
    // Label classes only by their batch (e.g. "B.Tech CSE · Sem 1 · Sec A").
    const batchIds = Array.from(new Set(classList.map((c) => c.batch_id).filter(Boolean) as string[]));
    const bMap = new Map<string, string>();
    if (batchIds.length) {
      const { data: bs } = await supabase.from("batches").select("id, program, semester, section").in("id", batchIds);
      for (const b of (bs ?? []) as any[]) bMap.set(b.id, formatBatch(b));
    }
    const labelFor = (c: { name: string; batch_id?: string | null }) =>
      (c.batch_id && bMap.get(c.batch_id)) || c.name;
    setClasses(classList);
    setClassMap(new Map(classList.map((c) => [c.id, labelFor(c)])));
    if (classIds.length === 0) { setItems([]); setStudentOptions([]); return; }

    // For students, build a "Subject - Teacher" dropdown that combines the
    // primary teacher of each enrolled class plus every additional teacher
    // the admin assigned via class_teachers.
    if (!isTeacher) {
      const { data: cts } = await supabase
        .from("class_teachers").select("class_id, teacher_id, subject").in("class_id", classIds);
      const teacherIds = Array.from(new Set([
        ...classList.map((c) => c.teacher_id).filter(Boolean) as string[],
        ...((cts ?? []) as any[]).map((r) => r.teacher_id),
      ]));
      const profs = teacherIds.length ? await fetchTeacherProfilesByIds(teacherIds) : new Map();
      const opts: { value: string; label: string; classId: string; teacherId: string }[] = [];
      for (const c of classList) {
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
      if (!studentFilter && opts[0]) setStudentFilter(opts[0].value);
    }

    let q = supabase.from("assignments").select("*").in("class_id", classIds);
    // Teachers see only their own postings.
    if (isTeacher && user) q = q.eq("created_by", user.id);
    const { data } = await q.order("due_at", { ascending: true, nullsFirst: false });
    setItems(data ?? []);
  };

  useEffect(() => { void load(); }, [user, role]);

  // Refresh when the user returns to the tab — picks up new classes/assignments.
  useEffect(() => {
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [user, role]);

  const createAssignment = async () => {
    if (!form.class_id) return toast.error("Pick a class");
    if (!form.title) return toast.error("Title required");
    // Optional: upload attachment file from teacher's PC to storage
    let attachment_url: string | null = null;
    const file = fileRef.current?.files?.[0];
    if (file) {
      const path = `${form.class_id}/${user!.id}/assignment-${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("class-files").upload(path, file);
      if (upErr) return toast.error(upErr.message);
      attachment_url = path;
    }
    const { error } = await supabase.from("assignments").insert({
      class_id: form.class_id, title: form.title, description: form.description || null,
      due_at: form.due_at ? new Date(form.due_at).toISOString() : null, max_marks: form.max_marks,
      attachment_url,
      created_by: user!.id,
    });
    if (error) return toast.error(error.message);
    toast.success("Assignment posted");
    setOpen(false);
    setForm({ class_id: "", title: "", description: "", due_at: "", max_marks: 100 });
    if (fileRef.current) fileRef.current.value = "";
    void load();
  };

  const deleteAssignment = async (e: React.MouseEvent, id: string) => {
    e.preventDefault(); e.stopPropagation();
    if (!confirm("Delete this assignment? Submissions will be lost.")) return;
    const { error } = await supabase.from("assignments").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Assignment deleted");
    void load();
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="label-caps">Assignments</div>
          <h1 className="text-2xl font-semibold">All assignments</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isTeacher ? "Post new work and track submissions." : "Submit your work and track grades."}
          </p>
        </div>
        {isTeacher && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button disabled={classes.length === 0}>
                <Upload className="h-4 w-4 mr-1" /> Upload assignment
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Upload new assignment</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Class</Label>
                  <select
                    className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
                    value={form.class_id}
                    onChange={(e) => setForm({ ...form, class_id: e.target.value })}
                  >
                    <option value="">Select class…</option>
                    {classes.map((c) => <option key={c.id} value={c.id}>{classMap.get(c.id) || c.name}</option>)}
                  </select>
                </div>
                <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
                <div><Label>Description</Label><Textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Due</Label><Input type="datetime-local" value={form.due_at} onChange={(e) => setForm({ ...form, due_at: e.target.value })} /></div>
                  <div><Label>Max marks</Label><Input type="number" value={form.max_marks} onChange={(e) => setForm({ ...form, max_marks: Number(e.target.value) })} /></div>
                </div>
                <div><Label>Attachment (optional)</Label><Input type="file" ref={fileRef} /></div>
                <Button onClick={createAssignment} className="w-full">Post assignment</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
        {!isTeacher && studentOptions.length > 0 && (
          // Students filter assignments by "Subject - Teacher" (e.g. "Maths - Sam").
          <select
            className="rounded-md border border-border bg-input px-3 py-2 text-sm"
            value={studentFilter}
            onChange={(e) => setStudentFilter(e.target.value)}
          >
            {studentOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )}
      </div>

      {(() => {
        // For students, narrow the list to the picked (class, teacher) pair.
        const visible = !isTeacher && studentFilter
          ? items.filter((a) => {
              const [cid, tid] = studentFilter.split("::");
              return a.class_id === cid && a.created_by === tid;
            })
          : items;
        return visible.length === 0 ? (
        <Card className="border-dashed p-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <FileText className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="mt-4 font-medium">No assignments yet</div>
          <p className="text-sm text-muted-foreground mt-1">
            {isTeacher ? "Click \"Upload assignment\" to post your first one." : "Once your teachers post work, it'll show up here."}
          </p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {visible.map((a) => (
            <Link key={a.id} to="/assignments/$id" params={{ id: a.id }}>
              <Card className="group h-full p-5 hover:border-primary/60 hover:bg-accent/30 transition-colors cursor-pointer relative">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="label-caps text-[10px] rounded-full border border-border px-2 py-0.5">
                      /{a.max_marks}
                    </span>
                    {isTeacher && (
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={(e) => deleteAssignment(e, a.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="label-caps mt-4">{classMap.get(a.class_id) || "Class"}</div>
                <div className="font-medium mt-1 line-clamp-2">{a.title}</div>
                {a.description && (
                  <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{a.description}</p>
                )}
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-4 pt-3 border-t border-border">
                  <Calendar className="h-3 w-3" />
                  Due {formatDateTime(a.due_at)}
                </div>
              </Card>
            </Link>
          ))}
        </div>
        );
      })()}
    </div>
  );
}
