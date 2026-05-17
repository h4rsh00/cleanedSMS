import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RequireAuth, useAuth, formatBatch } from "@/lib/app";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/timetable")({
  head: () => ({ meta: [{ title: "Timetable - College Portal" }] }),
  component: () => <RequireAuth><Timetable /></RequireAuth>,
});

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface Slot {
  id: string;
  class_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  room: string | null;
  subject: string | null;
  teacher_id: string | null;
}

function Timetable() {
  const { user, role } = useAuth();
  const isAdmin = role === "admin";
  const [slots, setSlots] = useState<Slot[]>([]);
  const [classes, setClasses] = useState<{ id: string; name: string; batch_id: string | null }[]>([]);
  const [batchMap, setBatchMap] = useState<Map<string, string>>(new Map());
  const [batchLabel, setBatchLabel] = useState<string | null>(null);
  const [openDay, setOpenDay] = useState<number | null>(null);
  const [form, setForm] = useState({ class_id: "", subject: "", teacher_staff_id: "", start_time: "09:00", end_time: "10:00", room: "" });
  const [saving, setSaving] = useState(false);
  const [teacherMap, setTeacherMap] = useState<Map<string, string>>(new Map());

  const labelFor = (c: { name: string; batch_id: string | null }) =>
    (c.batch_id && batchMap.get(c.batch_id)) || c.name;
  const classMap = new Map(classes.map((c) => [c.id, labelFor(c)]));

  const reload = async () => {
    if (!user) return;
    const { data: bs } = await supabase.from("batches").select("id, program, semester, section");
    setBatchMap(new Map((bs ?? []).map((b: any) => [b.id, formatBatch(b)])));

    let classIds: string[] = [];
    let classList: { id: string; name: string; batch_id: string | null }[] = [];
    if (isAdmin) {
      const { data } = await supabase.from("classes").select("id, name, batch_id");
      classList = (data ?? []) as any;
      classIds = classList.map((c) => c.id);
    } else if (role === "teacher") {
      // Teachers see classes where they are the primary teacher OR they have
      // been added as an additional teacher OR they appear on any timetable slot.
      const [{ data: own }, { data: extra }, { data: slotRows }] = await Promise.all([
        supabase.from("classes").select("id, name, batch_id").eq("teacher_id", user.id),
        supabase.from("class_teachers").select("class_id").eq("teacher_id", user.id),
        supabase.from("timetable_slots").select("class_id").eq("teacher_id", user.id),
      ]);
      const idSet = new Set<string>([
        ...((own ?? []) as any[]).map((c) => c.id),
        ...((extra ?? []) as any[]).map((r) => r.class_id),
        ...((slotRows ?? []) as any[]).map((r) => r.class_id),
      ]);
      classIds = Array.from(idSet);
      if (classIds.length) {
        const { data: cls } = await supabase.from("classes").select("id, name, batch_id").in("id", classIds);
        classList = (cls ?? []) as any;
      }
    } else {
      const { data: prof } = await supabase.from("profiles").select("batch_id").eq("id", user.id).maybeSingle();
      if (prof?.batch_id) {
        const { data: b } = await supabase.from("batches").select("program, semester, section").eq("id", prof.batch_id).maybeSingle();
        if (b) setBatchLabel(formatBatch(b as any));
      }
      const { data: enr } = await supabase.from("enrollments").select("class_id").eq("student_id", user.id);
      classIds = (enr ?? []).map((e) => e.class_id);
      if (classIds.length) {
        const { data: cls } = await supabase.from("classes").select("id, name, batch_id").in("id", classIds);
        classList = (cls ?? []) as any;
      }
    }
    setClasses(classList);
    if (!classIds.length) { setSlots([]); return; }
    let q = supabase.from("timetable_slots").select("*").in("class_id", classIds);
    // Teachers only see the slots they personally teach (not their colleagues').
    if (role === "teacher") q = q.eq("teacher_id", user.id);
    const { data } = await q.order("start_time");
    const allSlots = (data ?? []) as Slot[];
    setSlots(allSlots);
    const teacherIds = Array.from(new Set(allSlots.map((s) => s.teacher_id).filter(Boolean) as string[]));
    if (teacherIds.length) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", teacherIds);
      setTeacherMap(new Map((profs ?? []).map((p: any) => [p.id, p.full_name])));
    } else {
      setTeacherMap(new Map());
    }
  };

  useEffect(() => { void reload(); }, [user, role]);

  const byDay = (i: number) => slots.filter((s) => s.day_of_week === i + 1);

  const openAdd = (dayIndex: number) => {
    if (!isAdmin) return;
    if (classes.length === 0) {
      toast.error("Create a batch first before adding timetable slots.");
      return;
    }
    setForm({ class_id: classes[0].id, subject: "", teacher_staff_id: "", start_time: "09:00", end_time: "10:00", room: "" });
    setOpenDay(dayIndex);
  };

  const save = async () => {
    if (openDay === null) return;
    if (!form.class_id) return toast.error("Pick a batch");
    if (form.end_time <= form.start_time) return toast.error("End time must be after start time");
    let teacher_id: string | null = null;
    if (form.teacher_staff_id.trim()) {
      // Use .select() (not .maybeSingle) so a duplicate identifier never fails the lookup,
      // then check the role table to confirm we have a teacher.
      const sid = form.teacher_staff_id.trim();
      const { data: profs } = await supabase.from("profiles").select("id").eq("identifier", sid);
      if (!profs || profs.length === 0) return toast.error("No teacher found with that Staff ID (have they signed up?)");
      const ids = profs.map((p: any) => p.id);
      const { data: roles } = await supabase.from("user_roles").select("user_id, role").in("user_id", ids);
      const found = (roles ?? []).find((r: any) => r.role === "teacher")?.user_id;
      if (!found) return toast.error("That Staff ID is not registered as a teacher");
      teacher_id = found;
    }
    setSaving(true);
    const { error } = await supabase.from("timetable_slots").insert({
      class_id: form.class_id,
      day_of_week: openDay + 1,
      start_time: form.start_time,
      end_time: form.end_time,
      room: form.room || null,
      subject: form.subject || null,
      teacher_id,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Slot added");
    setOpenDay(null);
    await reload();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("timetable_slots").delete().eq("id", id);
    if (error) return toast.error(error.message);
    await reload();
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <div className="label-caps">Timetable</div>
        <h1 className="text-2xl font-semibold">Weekly schedule</h1>
        {isAdmin ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Click a day to add a slot. Only admins can edit the timetable.
          </p>
        ) : batchLabel ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Showing schedule for <span className="text-foreground font-medium">{batchLabel}</span>
          </p>
        ) : role === "teacher" ? (
          <p className="mt-1 text-sm text-muted-foreground">Read-only view of your batches.</p>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">
            No batch set. Pick your batch in <a href="/profile" className="underline">Profile</a> to see your timetable.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {DAYS.map((d, i) => (
          <Card
            key={d}
            className={`p-4 ${isAdmin ? "cursor-pointer transition hover:border-primary/40 hover:shadow-sm" : ""}`}
            onClick={() => isAdmin && openAdd(i)}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="label-caps">{d}</div>
              {isAdmin && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 px-2 text-xs"
                  onClick={(e) => { e.stopPropagation(); openAdd(i); }}
                >
                  <Plus className="h-3.5 w-3.5" /> Add
                </Button>
              )}
            </div>
            {byDay(i).length === 0 ? (
              <div className="text-xs text-muted-foreground">No classes</div>
            ) : (
              <table className="w-full text-xs">
                <thead className="text-[10px] label-caps text-muted-foreground">
                  <tr>
                    <th className="text-left pb-1 pr-2">Time</th>
                    <th className="text-left pb-1 pr-2">Subject</th>
                    <th className="text-left pb-1 pr-2">Teacher</th>
                    <th className="text-left pb-1 pr-2">Batch</th>
                    <th className="text-left pb-1">Room</th>
                    {isAdmin && <th />}
                  </tr>
                </thead>
                <tbody onClick={(e) => e.stopPropagation()}>
                  {byDay(i).map((s) => (
                    <tr key={s.id} className="border-t border-border">
                      <td className="py-2 pr-2 whitespace-nowrap">{s.start_time?.slice(0,5)}–{s.end_time?.slice(0,5)}</td>
                      <td className="py-2 pr-2">{s.subject || "-"}</td>
                      <td className="py-2 pr-2">{s.teacher_id ? teacherMap.get(s.teacher_id) ?? "—" : "—"}</td>
                      <td className="py-2 pr-2">{classMap.get(s.class_id) || "-"}</td>
                      <td className="py-2">{s.room || "TBD"}</td>
                      {isAdmin && (
                        <td className="py-2 text-right">
                          <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => remove(s.id)} aria-label="Delete slot">
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        ))}
      </div>

      <Dialog open={openDay !== null} onOpenChange={(o) => !o && setOpenDay(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Add slot - {openDay !== null ? DAYS[openDay] : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Batch</Label>
              <Select value={form.class_id} onValueChange={(v) => setForm({ ...form, class_id: v })}>
                <SelectTrigger><SelectValue placeholder="Pick a batch" /></SelectTrigger>
                <SelectContent>
                  {classes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{labelFor(c)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Subject</Label>
              <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="e.g. Mathematics" />
            </div>
            <div className="space-y-1">
              <Label>Teacher Staff ID</Label>
              <Input value={form.teacher_staff_id} onChange={(e) => setForm({ ...form, teacher_staff_id: e.target.value })} placeholder="e.g. STAFF001" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Start time</Label>
                <Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>End time</Label>
                <Input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Room</Label>
              <Input value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} placeholder="e.g. 302-A" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpenDay(null)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Add slot"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
