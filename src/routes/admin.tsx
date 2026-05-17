import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RequireAuth, useAuth, formatBatch } from "@/lib/app";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Trash2, Search, UserPlus, Plus, Check, Settings2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { deleteUserAccount, resetNonAdminAccounts } from "@/lib/admin-users.functions";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin - College Portal" }] }),
  component: () => <RequireAuth><Admin /></RequireAuth>,
});

interface Klass {
  id: string;
  name: string;
  code: string;
  description: string | null;
  teacher_id: string;
  batch_id: string | null;
}

function Admin() {
  const { role } = useAuth();
  const navigate = useNavigate();
  // Admin-only server functions for fully deleting users.
  const deleteAccount = useServerFn(deleteUserAccount);
  const resetAccounts = useServerFn(resetNonAdminAccounts);

  const [allowed, setAllowed] = useState<any[]>([]);
  const [classes, setClasses] = useState<Klass[]>([]);
  const [batchMap, setBatchMap] = useState<Map<string, string>>(new Map());
  const [teacherMap, setTeacherMap] = useState<Map<string, { name: string; identifier: string | null }>>(new Map());

  const [newId, setNewId] = useState({ identifier: "", role: "student" as "student" | "teacher" });

  const [openClass, setOpenClass] = useState<Klass | null>(null);
  const [enrollList, setEnrollList] = useState<Record<string, any[]>>({});
  const [enrollRoll, setEnrollRoll] = useState("");
  const [teacherList, setTeacherList] = useState<Record<string, any[]>>({});
  const [teacherStaffId, setTeacherStaffId] = useState("");
  // Subject the admin-assigned extra teacher will teach in this class.
  const [teacherSubject, setTeacherSubject] = useState("");

  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);

  useEffect(() => {
    if (role && role !== "admin") navigate({ to: "/dashboard" });
  }, [role, navigate]);

  const load = async () => {
    const [{ data: a }, { data: c }, { data: b }] = await Promise.all([
      supabase.from("allowed_identifiers").select("*").order("created_at", { ascending: false }),
      supabase.from("classes").select("*").order("created_at", { ascending: false }),
      supabase.from("batches").select("id, program, semester, section"),
    ]);
    setAllowed(a ?? []);
    setClasses((c as Klass[]) ?? []);
    setBatchMap(new Map((b ?? []).map((x: any) => [x.id, formatBatch(x)])));

    const teacherIds = Array.from(new Set(((c as Klass[]) ?? []).map((k) => k.teacher_id))).filter(Boolean);
    if (teacherIds.length) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name, identifier").in("id", teacherIds);
      setTeacherMap(new Map((profs ?? []).map((p: any) => [p.id, { name: p.full_name, identifier: p.identifier }])));
    } else {
      setTeacherMap(new Map());
    }
  };

  useEffect(() => { if (role === "admin") void load(); }, [role]);

  // ------- Authorize IDs -------
  const addId = async () => {
    if (!newId.identifier.trim()) return toast.error("Enter an identifier");
    const { error } = await supabase.from("allowed_identifiers").insert({
      identifier: newId.identifier.trim(), role: newId.role,
    });
    if (error) return toast.error(error.message);
    toast.success("Added");
    setNewId({ identifier: "", role: newId.role });
    void load();
  };

  const removeId = async (id: string) => {
    // Find the row first so we can also delete the linked auth account.
    const row = allowed.find((a) => a.id === id);
    const occupied = !!row?.used_by;
    const msg = occupied
      ? "Remove this ID AND delete the user account? The Roll No / Staff ID can then be reused."
      : "Remove this ID?";
    if (!confirm(msg)) return;
    if (occupied) {
      try { await deleteAccount({ data: { userId: row!.used_by } }); }
      catch (e: any) { return toast.error(e?.message || "Failed to delete account"); }
    }
    const { error } = await supabase.from("allowed_identifiers").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(occupied ? "Account deleted" : "Removed");
    void load();
  };

  const handleReset = async () => {
    if (!confirm("Delete EVERY non-admin account? This wipes all students, teachers, enrollments, submissions, attendance and scores.")) return;
    try {
      const r = await resetAccounts({});
      toast.success(`Removed ${r.removed} account(s)`);
      void load();
    } catch (e: any) { toast.error(e?.message || "Failed"); }
  };

  const deleteClass = async (id: string) => {
    if (!confirm("Delete this class and all related data?")) return;
    const { error } = await supabase.from("classes").delete().eq("id", id);
    if (error) return toast.error(error.message);
    void load();
  };

  // ------- Enrollments -------
  const loadEnrollments = async (classId: string) => {
    const { data: enr } = await supabase.from("enrollments").select("id, student_id").eq("class_id", classId);
    const ids = (enr ?? []).map((e: any) => e.student_id);
    if (!ids.length) { setEnrollList((m) => ({ ...m, [classId]: [] })); return; }
    const { data: profs } = await supabase.from("profiles").select("id, full_name, identifier").in("id", ids);
    const merged = (enr ?? []).map((e: any) => ({
      ...e, profile: (profs ?? []).find((p: any) => p.id === e.student_id),
    }));
    setEnrollList((m) => ({ ...m, [classId]: merged }));
  };

  const openClassDialog = async (k: Klass) => {
    setOpenClass(k);
    if (!enrollList[k.id]) await loadEnrollments(k.id);
    if (!teacherList[k.id]) await loadClassTeachers(k.id);
  };

  const addStudent = async (classId: string) => {
    const roll = enrollRoll.trim();
    if (!roll) return toast.error("Enter Roll No");
    const { data: profs } = await supabase.from("profiles").select("id").eq("identifier", roll);
    if (!profs || profs.length === 0) return toast.error("No student found with that Roll No (have they signed up?)");
    const ids = profs.map((p: any) => p.id);
    const { data: roles } = await supabase.from("user_roles").select("user_id, role").in("user_id", ids);
    const studentId = (roles ?? []).find((r: any) => r.role === "student")?.user_id;
    if (!studentId) return toast.error("That Roll No is not registered as a student");
    const { error } = await supabase.from("enrollments").insert({ class_id: classId, student_id: studentId });
    if (error) return toast.error(error.message);
    toast.success("Student added");
    setEnrollRoll("");
    await loadEnrollments(classId);
  };

  const removeStudent = async (classId: string, enrollmentId: string) => {
    if (!confirm("Remove this student from the class?")) return;
    const { error } = await supabase.from("enrollments").delete().eq("id", enrollmentId);
    if (error) return toast.error(error.message);
    await loadEnrollments(classId);
  };

  // ------- Class teachers (admin assigns extra teachers to a batch) -------
  const loadClassTeachers = async (classId: string) => {
    const { data: rows } = await supabase.from("class_teachers").select("id, teacher_id, subject").eq("class_id", classId);
    const ids = (rows ?? []).map((r: any) => r.teacher_id);
    if (!ids.length) { setTeacherList((m) => ({ ...m, [classId]: [] })); return; }
    const { data: profs } = await supabase.from("profiles").select("id, full_name, identifier").in("id", ids);
    const merged = (rows ?? []).map((r: any) => ({
      ...r, profile: (profs ?? []).find((p: any) => p.id === r.teacher_id),
    }));
    setTeacherList((m) => ({ ...m, [classId]: merged }));
  };

  const addTeacher = async (classId: string) => {
    const sid = teacherStaffId.trim();
    if (!sid) return toast.error("Enter Staff ID");
    const subject = teacherSubject.trim();
    if (!subject) return toast.error("Enter the subject this teacher will teach");
    const { data: profs } = await supabase.from("profiles").select("id").eq("identifier", sid);
    if (!profs || profs.length === 0) return toast.error("No teacher found with that Staff ID (have they signed up?)");
    const ids = profs.map((p: any) => p.id);
    const { data: roles } = await supabase.from("user_roles").select("user_id, role").in("user_id", ids);
    const teacherId = (roles ?? []).find((r: any) => r.role === "teacher")?.user_id;
    if (!teacherId) return toast.error("That Staff ID is not registered as a teacher");
    const { error } = await supabase.from("class_teachers").insert({ class_id: classId, teacher_id: teacherId, subject });
    if (error) return toast.error(error.message);
    toast.success("Teacher added");
    setTeacherStaffId("");
    setTeacherSubject("");
    await loadClassTeachers(classId);
  };

  const removeTeacher = async (classId: string, rowId: string) => {
    if (!confirm("Remove this teacher from the batch?")) return;
    const { error } = await supabase.from("class_teachers").delete().eq("id", rowId);
    if (error) return toast.error(error.message);
    await loadClassTeachers(classId);
  };

  // ------- Search profiles -------
  const search = async () => {
    const q = searchQ.trim();
    if (!q) return;
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, identifier, department")
      .ilike("identifier", `%${q}%`)
      .limit(20);
    if (!data || data.length === 0) {
      setSearchResults([]);
      toast.error("No matching user found");
      return;
    }
    const ids = data.map((p: any) => p.id);
    const { data: roles } = await supabase.from("user_roles").select("user_id, role").in("user_id", ids);
    const roleMap = new Map((roles ?? []).map((r: any) => [r.user_id, r.role]));
    setSearchResults(data.map((p: any) => ({ ...p, role: roleMap.get(p.id) })));
  };

  if (role !== "admin") return null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <div className="label-caps">Admin</div>
        <h1 className="text-2xl font-semibold">Control panel</h1>
        <p className="text-sm text-muted-foreground">Authorise IDs, manage classes, enroll students, and look up profiles.</p>
      </div>

      {/* Authorize IDs */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="label-caps text-xs">Authorise new ID</div>
          <Button size="sm" variant="outline" onClick={handleReset}>
            <Trash2 className="h-3.5 w-3.5 mr-1" />Reset accounts
          </Button>
        </div>
        <div className="grid grid-cols-[1fr_180px_auto] gap-2 items-end">
          <div>
            <Label>Roll No / Staff ID</Label>
            <Input value={newId.identifier} onChange={(e) => setNewId({ ...newId, identifier: e.target.value })} placeholder="e.g. 22BCS1234" />
          </div>
          <div>
            <Label>Role</Label>
            <select className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
              value={newId.role} onChange={(e) => setNewId({ ...newId, role: e.target.value as "student" | "teacher" })}>
              <option value="student">Student (Roll No)</option>
              <option value="teacher">Teacher (Staff ID)</option>
            </select>
          </div>
          <Button onClick={addId}><Plus className="h-4 w-4 mr-1" />Add</Button>
        </div>
        {allowed.length === 0 ? (
          <p className="text-xs text-muted-foreground">No IDs yet. Add one so a user can sign up.</p>
        ) : (
          <div className="border-t border-border divide-y divide-border text-sm max-h-60 overflow-auto">
            {allowed.map((a) => (
              <div key={a.id} className="py-2 flex items-center justify-between">
                {a.used_by ? (
                  <Link to="/profile" search={{ id: a.used_by }} className="flex-1 hover:underline">
                    <div className="font-medium flex items-center gap-2">
                      {a.identifier}
                      <Check className="h-4 w-4 text-emerald-500" />
                    </div>
                    <div className="text-xs text-muted-foreground capitalize">{a.role}</div>
                  </Link>
                ) : (
                  <div className="flex-1">
                    <div className="font-medium">{a.identifier}</div>
                    <div className="text-xs text-muted-foreground capitalize">{a.role}</div>
                  </div>
                )}
                <Button size="icon" variant="ghost" onClick={() => removeId(a.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Manage classes */}
      <Card className="p-6 space-y-3">
        <div className="label-caps text-xs">Classes</div>
        {classes.length === 0 ? (
          <p className="text-xs text-muted-foreground">No classes yet.</p>
        ) : (
          <div className="border-t border-border divide-y divide-border text-sm">
            {classes.map((c) => {
              const t = teacherMap.get(c.teacher_id);
              return (
                <div key={c.id} className="py-3 flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{c.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {c.batch_id ? batchMap.get(c.batch_id) ?? "Batch" : "—"} · Code {c.code} · Teacher: {t?.name || "—"}{t?.identifier ? ` (${t.identifier})` : ""}
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => openClassDialog(c)}>
                    <Settings2 className="h-4 w-4 mr-1" />Manage
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => deleteClass(c.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Manage class dialog */}
      <Dialog open={!!openClass} onOpenChange={(o) => { if (!o) { setOpenClass(null); setEnrollRoll(""); setTeacherStaffId(""); setTeacherSubject(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{openClass?.name}</DialogTitle>
            <DialogDescription>
              {openClass?.batch_id ? batchMap.get(openClass.batch_id) ?? "Batch" : "—"} · Code {openClass?.code}
            </DialogDescription>
          </DialogHeader>
          {openClass && (
            <div className="space-y-4">
              <div>
                <div className="label-caps text-xs mb-2">Teachers</div>
                <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                  <div>
                    <Label>Add teacher by Staff ID</Label>
                    <Input value={teacherStaffId} onChange={(e) => setTeacherStaffId(e.target.value)} placeholder="e.g. STAFF001" />
                  </div>
                  <div>
                    <Label>Subject</Label>
                    <Input value={teacherSubject} onChange={(e) => setTeacherSubject(e.target.value)} placeholder="e.g. Mathematics" />
                  </div>
                  <Button onClick={() => addTeacher(openClass.id)}><UserPlus className="h-4 w-4 mr-1" />Add</Button>
                </div>
                {(teacherList[openClass.id] ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground mt-2">No additional teachers assigned.</p>
                ) : (
                  <div className="divide-y divide-border mt-2">
                    {(teacherList[openClass.id] ?? []).map((t: any) => (
                      <div key={t.id} className="py-2 flex items-center justify-between">
                        <Link to="/profile" search={{ id: t.teacher_id }} className="hover:underline">
                          <div className="font-medium">{t.profile?.full_name || "—"}</div>
                          <div className="text-xs text-muted-foreground">
                            {t.profile?.identifier || "—"}{t.subject ? ` · ${t.subject}` : ""}
                          </div>
                        </Link>
                        <Button size="icon" variant="ghost" onClick={() => removeTeacher(openClass.id, t.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-border" />

              <div>
                <div className="label-caps text-xs mb-2">Students</div>
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Label>Add student by Roll No</Label>
                  <Input value={enrollRoll} onChange={(e) => setEnrollRoll(e.target.value)} placeholder="e.g. 22BCS1234" />
                </div>
                <Button onClick={() => addStudent(openClass.id)}><UserPlus className="h-4 w-4 mr-1" />Add</Button>
              </div>
              {(enrollList[openClass.id] ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground mt-2">No students enrolled yet.</p>
              ) : (
                  <div className="divide-y divide-border max-h-60 overflow-auto mt-2">
                  {(enrollList[openClass.id] ?? []).map((e: any) => (
                    <div key={e.id} className="py-2 flex items-center justify-between">
                      <Link to="/profile" search={{ id: e.student_id }} className="hover:underline">
                        <div className="font-medium">{e.profile?.full_name || "—"}</div>
                        <div className="text-xs text-muted-foreground">{e.profile?.identifier || "—"}</div>
                      </Link>
                      <Button size="icon" variant="ghost" onClick={() => removeStudent(openClass.id, e.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Search profiles */}
      <Card className="p-6 space-y-3">
        <div className="label-caps text-xs">Look up student or teacher</div>
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <Label>Roll No / Staff ID</Label>
            <Input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} placeholder="e.g. 22BCS1234 or STAFF001" />
          </div>
          <Button onClick={search}><Search className="h-4 w-4 mr-1" />Search</Button>
        </div>
        {searchResults.length > 0 && (
          <div className="border-t border-border divide-y divide-border text-sm">
            {searchResults.map((r) => (
              <Link key={r.id} to="/profile" search={{ id: r.id }} className="py-2 flex items-center justify-between hover:bg-accent/30 rounded px-2">
                <div>
                  <div className="font-medium">{r.full_name || "—"}</div>
                  <div className="text-xs text-muted-foreground capitalize">{r.role || "—"} · {r.identifier || "—"}{r.department ? ` · ${r.department}` : ""}</div>
                </div>
                <span className="text-xs text-muted-foreground">View profile →</span>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
