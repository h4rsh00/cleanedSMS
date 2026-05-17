import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RequireAuth, useAuth, BatchPicker, formatBatch } from "@/lib/app";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/classes/")({
  head: () => ({ meta: [{ title: "Classes - College Portal" }] }),
  component: () => <RequireAuth><Classes /></RequireAuth>,
});

interface Klass {
  id: string;
  name: string;
  code: string;
  description: string | null;
  semester: string | null;
  teacher_id: string;
  batch_id: string | null;
}

function Classes() {
  const { user, role } = useAuth();
  const [classes, setClasses] = useState<Klass[]>([]);
  const [open, setOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [batchMap, setBatchMap] = useState<Map<string, string>>(new Map());
  const [form, setForm] = useState({ name: "", description: "", batch_id: null as string | null });

  const load = async () => {
    if (!user) return;
    if (role === "admin") {
      const { data } = await supabase.from("classes").select("*").order("created_at", { ascending: false });
      setClasses((data as Klass[]) ?? []);
    } else if (role === "teacher") {
      const [{ data: own }, { data: extra }] = await Promise.all([
        supabase.from("classes").select("*").eq("teacher_id", user.id),
        supabase.from("class_teachers").select("class_id").eq("teacher_id", user.id),
      ]);
      const extraIds = ((extra ?? []) as any[]).map((r) => r.class_id);
      const merged: Klass[] = ((own ?? []) as Klass[]);
      if (extraIds.length) {
        const { data: more } = await supabase.from("classes").select("*").in("id", extraIds);
        const seen = new Set(merged.map((c) => c.id));
        for (const c of (more ?? []) as Klass[]) if (!seen.has(c.id)) merged.push(c);
      }
      merged.sort((a: any, b: any) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
      setClasses(merged);
    } else {
      const { data: enr } = await supabase.from("enrollments").select("class_id").eq("student_id", user.id);
      const ids = (enr ?? []).map((e) => e.class_id);
      if (ids.length === 0) { setClasses([]); return; }
      const { data } = await supabase.from("classes").select("*").in("id", ids);
      setClasses((data as Klass[]) ?? []);
    }
  };

  useEffect(() => { void load(); }, [user, role]);

  // Refresh when the user comes back to the tab — picks up admin-side changes.
  useEffect(() => {
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [user, role]);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from("batches").select("id, program, semester, section");
      setBatchMap(new Map((data ?? []).map((b: any) => [b.id, formatBatch(b)])));
    })();
  }, []);

  const createClass = async () => {
    if (!user) return;
    if (!form.name) return toast.error("Name required");
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    const { error } = await supabase.from("classes").insert({
      name: form.name, code, description: form.description || null,
      teacher_id: user.id, batch_id: form.batch_id,
    });
    if (error) return toast.error(error.message);
    toast.success(`Class created · join code ${code}`);
    setOpen(false); setForm({ name: "", description: "", batch_id: null });
    void load();
  };

  const joinClass = async () => {
    if (!user || !joinCode) return;
    const { data: cls } = await supabase.from("classes").select("id").eq("code", joinCode.toUpperCase()).maybeSingle();
    if (!cls) return toast.error("No class with that code");
    const { error } = await supabase.from("enrollments").insert({ class_id: cls.id, student_id: user.id });
    if (error) return toast.error(error.message);
    toast.success("Joined class");
    setJoinCode(""); void load();
  };

  const deleteClass = async (e: React.MouseEvent, id: string) => {
    e.preventDefault(); e.stopPropagation();
    if (!confirm("Delete this class? All assignments, enrollments, and schedule will be removed.")) return;
    const { error } = await supabase.from("classes").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Class deleted"); void load();
  };

  const leaveClass = async (e: React.MouseEvent, id: string) => {
    e.preventDefault(); e.stopPropagation();
    if (!user || !confirm("Leave this class?")) return;
    const { error } = await supabase.from("enrollments").delete().eq("class_id", id).eq("student_id", user.id);
    if (error) return toast.error(error.message);
    toast.success("Left class"); void load();
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="label-caps">Batches</div>
          <h1 className="text-2xl font-semibold">
            {role === "admin" ? "All batches" : role === "teacher" ? "Your batches" : "Enrolled batches"}
          </h1>
        </div>
        {role === "admin" ? (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> New batch</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create batch</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div>
                  <Label>Batch</Label>
                  <BatchPicker value={form.batch_id} onChange={(id) => setForm({ ...form, batch_id: id })} />
                </div>
                <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
                <Button onClick={createClass} className="w-full">Create</Button>
              </div>
            </DialogContent>
          </Dialog>
        ) : null}
      </div>

      {classes.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          {role === "admin"
            ? "No batches yet. Create one to get started."
            : role === "teacher"
            ? "You haven't been assigned any batches."
            : "You haven't been added to any batches yet."}
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {classes.map((c) => {
            const batchLabel = c.batch_id ? batchMap.get(c.batch_id) : null;
            const showAction = role === "admin" || role === "student";
            return (
              <Link key={c.id} to="/classes/$id" params={{ id: c.id }}>
                <Card className="p-5 hover:bg-accent/40 cursor-pointer h-full relative">
                  <div className="flex items-start justify-between gap-2">
                    <div className="label-caps">{batchLabel ?? "Batch"}</div>
                    {showAction && (
                      <Button
                        size="icon" variant="ghost"
                        className="h-7 w-7 -mt-1 -mr-1 text-muted-foreground hover:text-destructive"
                        onClick={(e) => role === "admin" ? deleteClass(e, c.id) : leaveClass(e, c.id)}
                        title={role === "admin" ? "Delete batch" : "Leave batch"}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  <h3 className="mt-1 text-lg font-semibold">{batchLabel ?? "Batch"}</h3>
                  {c.description && <p className="text-sm text-muted-foreground mt-3 line-clamp-2">{c.description}</p>}
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
