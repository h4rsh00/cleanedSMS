import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { RequireAuth, useAuth, fetchProfilesByIds, formatDate, formatDateTime } from "@/lib/app";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, FileText, Calendar } from "lucide-react";

export const Route = createFileRoute("/classes/$id")({
  head: () => ({ meta: [{ title: "Class - College Portal" }] }),
  component: () => <RequireAuth><ClassDetail /></RequireAuth>,
});

function ClassDetail() {
  const { id } = Route.useParams();
  const { user, role } = useAuth();
  const isTeacher = role === "teacher";
  const isAdmin = role === "admin";
  const canEditSchedule = isAdmin;
  const canRemoveStudent = isAdmin;

  const [klass, setKlass] = useState<any>(null);
  const [roster, setRoster] = useState<{ id: string; full_name: string; identifier: string | null }[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [slots, setSlots] = useState<any[]>([]);

  const [aOpen, setAOpen] = useState(false);
  const [annOpen, setAnnOpen] = useState(false);
  const [slotOpen, setSlotOpen] = useState(false);
  const [aForm, setAForm] = useState({ title: "", description: "", due_at: "", max_marks: 100 });
  const aFileRef = useRef<HTMLInputElement>(null);
  const [annForm, setAnnForm] = useState({ title: "", body: "" });
  const [slotForm, setSlotForm] = useState({ day_of_week: 1, start_time: "09:00", end_time: "10:00", room: "" });

  const load = async () => {
    const { data: c } = await supabase.from("classes").select("*").eq("id", id).maybeSingle();
    setKlass(c);

    const { data: enr } = await supabase.from("enrollments").select("student_id").eq("class_id", id);
    const ids = (enr ?? []).map((e) => e.student_id);
    const profMap = await fetchProfilesByIds(ids);
    setRoster(ids.map((i) => profMap.get(i)).filter(Boolean) as any);

    const { data: a } = await supabase.from("assignments").select("*").eq("class_id", id).order("created_at", { ascending: false });
    setAssignments(a ?? []);

    const { data: an } = await supabase.from("announcements").select("*").eq("class_id", id).order("created_at", { ascending: false });
    setAnnouncements(an ?? []);

    const { data: ts } = await supabase.from("timetable_slots").select("*").eq("class_id", id).order("day_of_week");
    setSlots(ts ?? []);
  };

  useEffect(() => { void load(); }, [id]);

  const createAssignment = async () => {
    if (!aForm.title) return toast.error("Title required");
    // Optional file from teacher PC -> storage bucket
    let attachment_url: string | null = null;
    const file = aFileRef.current?.files?.[0];
    if (file) {
      const path = `${id}/${user!.id}/assignment-${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("class-files").upload(path, file);
      if (upErr) return toast.error(upErr.message);
      attachment_url = path;
    }
    const { error } = await supabase.from("assignments").insert({
      class_id: id, title: aForm.title, description: aForm.description || null,
      due_at: aForm.due_at ? new Date(aForm.due_at).toISOString() : null, max_marks: aForm.max_marks,
      attachment_url,
    });
    if (error) return toast.error(error.message);
    toast.success("Assignment posted"); setAOpen(false);
    setAForm({ title: "", description: "", due_at: "", max_marks: 100 });
    if (aFileRef.current) aFileRef.current.value = "";
    void load();
  };

  const createAnnouncement = async () => {
    if (!user || !annForm.title || !annForm.body) return toast.error("All fields required");
    const { error } = await supabase.from("announcements").insert({
      class_id: id, author_id: user.id, title: annForm.title, body: annForm.body,
    });
    if (error) return toast.error(error.message);
    toast.success("Posted"); setAnnOpen(false); setAnnForm({ title: "", body: "" }); void load();
  };

  const createSlot = async () => {
    const { error } = await supabase.from("timetable_slots").insert({
      class_id: id, day_of_week: slotForm.day_of_week,
      start_time: slotForm.start_time, end_time: slotForm.end_time, room: slotForm.room || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Added"); setSlotOpen(false); void load();
  };

  const removeStudent = async (studentId: string) => {
    if (!confirm("Remove this student?")) return;
    await supabase.from("enrollments").delete().eq("class_id", id).eq("student_id", studentId);
    void load();
  };

  if (!klass) return <div className="text-sm text-muted-foreground">Loading…</div>;

  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <Link to="/classes" className="text-xs text-muted-foreground hover:text-foreground">← All classes</Link>
        <div className="label-caps mt-3">{klass.code}</div>
        <h1 className="text-2xl font-semibold">{klass.name}</h1>
        <p className="text-sm text-muted-foreground">{klass.semester || "-"}</p>
        {klass.description && <p className="mt-3 text-sm text-muted-foreground max-w-3xl">{klass.description}</p>}
      </div>

      <Tabs defaultValue="announcements">
        <TabsList>
          <TabsTrigger value="announcements">Announcements</TabsTrigger>
          <TabsTrigger value="assignments">Assignments</TabsTrigger>
          <TabsTrigger value="roster">Roster</TabsTrigger>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
        </TabsList>

        <TabsContent value="announcements" className="space-y-3">
          {isTeacher && (
            <Dialog open={annOpen} onOpenChange={setAnnOpen}>
              <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> New announcement</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>New announcement</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>Title</Label><Input value={annForm.title} onChange={(e) => setAnnForm({ ...annForm, title: e.target.value })} /></div>
                  <div><Label>Body</Label><Textarea rows={5} value={annForm.body} onChange={(e) => setAnnForm({ ...annForm, body: e.target.value })} /></div>
                  <Button onClick={createAnnouncement} className="w-full">Post</Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
          {announcements.length === 0 ? (
            <Card className="p-6 text-sm text-muted-foreground">No announcements.</Card>
          ) : announcements.map((a) => (
            <Card key={a.id} className="p-4 relative">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{a.title}</div>
                  <div className="text-xs text-muted-foreground mb-2">{formatDateTime(a.created_at)}</div>
                </div>
                {isTeacher && a.author_id === user?.id && (
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={async () => {
                      if (!confirm("Delete this announcement?")) return;
                      const { error } = await supabase.from("announcements").delete().eq("id", a.id);
                      if (error) return toast.error(error.message);
                      toast.success("Deleted"); void load();
                    }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <p className="text-sm whitespace-pre-wrap">{a.body}</p>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="assignments" className="space-y-3">
          {isTeacher && (
            <Dialog open={aOpen} onOpenChange={setAOpen}>
              <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Upload assignment</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Upload assignment for {klass.name}</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>Title</Label><Input value={aForm.title} onChange={(e) => setAForm({ ...aForm, title: e.target.value })} /></div>
                  <div><Label>Description</Label><Textarea rows={4} value={aForm.description} onChange={(e) => setAForm({ ...aForm, description: e.target.value })} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Due</Label><Input type="datetime-local" value={aForm.due_at} onChange={(e) => setAForm({ ...aForm, due_at: e.target.value })} /></div>
                    <div><Label>Max marks</Label><Input type="number" value={aForm.max_marks} onChange={(e) => setAForm({ ...aForm, max_marks: Number(e.target.value) })} /></div>
                  </div>
                  <div><Label>Question paper / file (optional)</Label><Input type="file" ref={aFileRef} /></div>
                  <Button onClick={createAssignment} className="w-full">Post assignment</Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
          {assignments.length === 0 ? (
            <Card className="p-6 text-sm text-muted-foreground">
              {isTeacher ? "No assignments yet. Upload one to get started." : "No assignments posted yet."}
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {assignments.map((a) => (
                <Link key={a.id} to="/assignments/$id" params={{ id: a.id }}>
                  <Card className="p-4 hover:bg-accent/40 cursor-pointer h-full">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <FileText className="h-4 w-4" />
                      </div>
                      <span className="label-caps text-[10px] rounded-full border border-border px-2 py-0.5">/{a.max_marks}</span>
                    </div>
                    <div className="font-medium mt-3 line-clamp-2">{a.title}</div>
                    {a.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.description}</p>}
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-3 pt-3 border-t border-border">
                      <Calendar className="h-3 w-3" />
                      {a.due_at ? `Due ${formatDateTime(a.due_at)}` : "No due date"}
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="roster">
          <Card className="p-0 overflow-hidden">
            {roster.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">No students enrolled yet. Share code <span className="font-mono text-foreground">{klass.code}</span>.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs label-caps">
                  <tr><th className="text-left px-4 py-3">Name</th><th className="text-left px-4 py-3">Roll No / Staff ID</th>{canRemoveStudent && <th />}</tr>
                </thead>
                <tbody>
                  {roster.map((s) => (
                    <tr key={s.id} className="border-t border-border">
                      <td className="px-4 py-3">
                        <Link to="/profile" search={{ id: s.id }} className="hover:underline">
                          {s.full_name || "-"}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{s.identifier || "-"}</td>
                      {canRemoveStudent && <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="ghost" onClick={() => removeStudent(s.id)}>Remove</Button>
                      </td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="schedule" className="space-y-3">
          {canEditSchedule && (
            <Dialog open={slotOpen} onOpenChange={setSlotOpen}>
              <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add slot</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Schedule slot</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Day</Label>
                    <select className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm" value={slotForm.day_of_week} onChange={(e) => setSlotForm({ ...slotForm, day_of_week: Number(e.target.value) })}>
                      {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Start</Label><Input type="time" value={slotForm.start_time} onChange={(e) => setSlotForm({ ...slotForm, start_time: e.target.value })} /></div>
                    <div><Label>End</Label><Input type="time" value={slotForm.end_time} onChange={(e) => setSlotForm({ ...slotForm, end_time: e.target.value })} /></div>
                  </div>
                  <div><Label>Room</Label><Input value={slotForm.room} onChange={(e) => setSlotForm({ ...slotForm, room: e.target.value })} /></div>
                  <Button onClick={createSlot} className="w-full">Add</Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
          {slots.length === 0 ? (
            <Card className="p-6 text-sm text-muted-foreground">No schedule set.</Card>
          ) : (
            <div className="grid gap-2">
              {slots.map((s) => (
                <Card key={s.id} className="flex items-center justify-between p-4">
                  <div>
                    <div className="font-medium">
                      {DAYS[s.day_of_week]} · {s.start_time?.slice(0,5)} – {s.end_time?.slice(0,5)}
                      {s.subject ? ` · ${s.subject}` : ""}
                    </div>
                    <div className="text-xs text-muted-foreground">{s.room || "Room TBD"}</div>
                  </div>
                  {canEditSchedule && (
                    <Button size="sm" variant="ghost" onClick={async () => { await supabase.from("timetable_slots").delete().eq("id", s.id); void load(); }}>Delete</Button>
                  )}
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
