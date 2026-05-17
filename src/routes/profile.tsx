import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { RequireAuth, useAuth, BatchPicker } from "@/lib/app";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "Profile - College Portal" }] }),
  validateSearch: (s: Record<string, unknown>) => ({ id: typeof s.id === "string" ? s.id : undefined }),
  component: () => <RequireAuth><ProfileRoute /></RequireAuth>,
});

const DOC_TYPES = ["ID Card", "Marksheet", "Admission", "Other"] as const;

function ProfileRoute() {
  const { user } = useAuth();
  const { id: viewId } = Route.useSearch();
  if (viewId && viewId !== user?.id) return <PublicProfile id={viewId} />;
  return <Profile />;
}

function PublicProfile({ id }: { id: string }) {
  const [profile, setProfile] = useState<any>(null);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [{ data: p }, { data: r }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", id).maybeSingle(),
      ]);
      setProfile(p);
      setRole((r as any)?.role ?? null);
    })();
  }, [id]);

  if (!profile) return <div className="text-sm text-muted-foreground">Loading…</div>;
  const isTeacher = role === "teacher" || role === "admin";
  const idLabel = isTeacher ? "Staff ID" : "Roll No";
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <div className="label-caps">Profile</div>
        <h1 className="text-2xl font-semibold">{profile.full_name || "-"}</h1>
        <p className="text-xs text-muted-foreground capitalize">{role ?? "-"}</p>
      </div>
      <Card className="p-6 space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="label-caps text-xs">{idLabel}</div>
            <div className="mt-1">{profile.identifier || "-"}</div>
          </div>
          {profile.department && (
            <div>
              <div className="label-caps text-xs">Department</div>
              <div className="mt-1">{profile.department}</div>
            </div>
          )}
          {profile.phone && (
            <div>
              <div className="label-caps text-xs">Phone</div>
              <div className="mt-1">{profile.phone}</div>
            </div>
          )}
        </div>
        {profile.bio && (
          <div>
            <div className="label-caps text-xs">Bio</div>
            <p className="mt-1 whitespace-pre-wrap">{profile.bio}</p>
          </div>
        )}
      </Card>
    </div>
  );
}

function Profile() {
  const { user, profile, role, refreshProfile } = useAuth();
  const isTeacher = role === "teacher";
  const isAdmin = role === "admin";
  const isStudent = role === "student";

  const [form, setForm] = useState<any>({
    full_name: "", identifier: "", bio: "",
    department: "", batch_id: null,
    admission_no: "", admission_date: "", dob: "", address: "", phone: "",
    parent_name: "", parent_phone: "", parent_email: "",
    id_card_url: "",
  });
  const [docs, setDocs] = useState<any[]>([]);
  const [docTitle, setDocTitle] = useState("");
  const [docType, setDocType] = useState<string>("Marksheet");
  const [docSemester, setDocSemester] = useState<string>("1");
  const docFileRef = useRef<HTMLInputElement>(null);
  const idCardRef = useRef<HTMLInputElement>(null);


  useEffect(() => {
    if (profile) {
      const p: any = profile;
      setForm({
        full_name: p.full_name || "",
        identifier: p.identifier || "",
        bio: p.bio || "",
        department: p.department || "",
        batch_id: p.batch_id ?? null,
        admission_no: p.admission_no || "",
        admission_date: p.admission_date || "",
        dob: p.dob || "",
        address: p.address || "",
        phone: p.phone || "",
        parent_name: p.parent_name || "",
        parent_phone: p.parent_phone || "",
        parent_email: p.parent_email || "",
        id_card_url: p.id_card_url || "",
      });
    }
  }, [profile]);

  const loadDocs = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("student_documents")
      .select("*")
      .eq("student_id", user.id)
      .order("uploaded_at", { ascending: false });
    setDocs(data ?? []);
  };

  useEffect(() => { void loadDocs(); }, [user]);


  const save = async () => {
    if (!user) return;
    const payload: any = (isTeacher || isAdmin)
      ? {
          full_name: form.full_name, bio: form.bio,
          phone: form.phone, id_card_url: form.id_card_url || null,
        }
      : {
          full_name: form.full_name, bio: form.bio,
          batch_id: form.batch_id,
          admission_no: form.admission_no || null,
          admission_date: form.admission_date || null,
          dob: form.dob || null,
          address: form.address || null,
          phone: form.phone || null,
          parent_name: form.parent_name || null,
          parent_phone: form.parent_phone || null,
          parent_email: form.parent_email || null,
          id_card_url: form.id_card_url || null,
        };
    const { error } = await supabase.from("profiles").update(payload).eq("id", user.id);
    if (error) return toast.error(error.message);
    toast.success("Profile updated");
    await refreshProfile();
  };

  const uploadIdCard = async () => {
    if (!user) return;
    const file = idCardRef.current?.files?.[0];
    if (!file) return toast.error("Pick a file");
    const path = `${user.id}/id-card-${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("student-docs").upload(path, file, { upsert: true });
    if (error) return toast.error(error.message);
    setForm((f: any) => ({ ...f, id_card_url: path }));
    if (idCardRef.current) idCardRef.current.value = "";
    toast.success("ID card uploaded · click Save changes");
  };

  const viewFile = async (path: string) => {
    const { data, error } = await supabase.storage.from("student-docs").createSignedUrl(path, 60);
    if (error || !data) return toast.error(error?.message || "Failed");
    window.open(data.signedUrl, "_blank");
  };

  const uploadDoc = async () => {
    if (!user) return;
    const file = docFileRef.current?.files?.[0];
    if (!file || !docTitle) return toast.error("Title and file required");
    const finalTitle = `Sem ${docSemester} - ${docType} - ${docTitle}`;
    const path = `${user.id}/${docType}-${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("student-docs").upload(path, file);
    if (upErr) return toast.error(upErr.message);
    const { error } = await supabase.from("student_documents").insert({
      student_id: user.id, doc_type: docType, title: finalTitle, file_url: path,
    });
    if (error) return toast.error(error.message);
    toast.success("Document uploaded");
    setDocTitle(""); if (docFileRef.current) docFileRef.current.value = "";
    void loadDocs();
  };

  const deleteDoc = async (d: any) => {
    if (!confirm("Delete this document?")) return;
    await supabase.storage.from("student-docs").remove([d.file_url]);
    await supabase.from("student_documents").delete().eq("id", d.id);
    void loadDocs();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <div className="label-caps">Profile</div>
        <h1 className="text-2xl font-semibold">Account settings</h1>
        <p className="text-xs text-muted-foreground capitalize">{role} · {user?.email}</p>
      </div>

      {/* Basic info */}
      <Card className="p-6 space-y-4">
        <div className="label-caps text-xs">Basic info</div>
        <div><Label>Full name</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>{isTeacher ? "Staff ID" : "Roll No"}</Label><Input value={form.identifier} readOnly disabled /></div>
          <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
        </div>
        <div><Label>Bio</Label><Textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} /></div>

        {!isTeacher && (
          <div>
            <Label>Batch</Label>
            <BatchPicker value={form.batch_id} onChange={(id) => setForm({ ...form, batch_id: id })} />
          </div>
        )}
      </Card>

      {/* ID Card */}
      {!isAdmin && (
      <Card className="p-6 space-y-3">
        <div className="label-caps text-xs">ID card</div>
        {form.id_card_url ? (
          <div className="flex items-center gap-3 text-sm">
            <button className="underline" onClick={() => viewFile(form.id_card_url)}>View current ID card</button>
            <Button size="sm" variant="ghost" onClick={() => setForm({ ...form, id_card_url: "" })}>Remove</Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No ID card uploaded yet.</p>
        )}
        <div className="flex gap-2 items-end">
          <div className="flex-1"><Label>Upload ID card</Label><Input type="file" ref={idCardRef} accept="image/*,application/pdf" /></div>
          <Button onClick={uploadIdCard}>Upload</Button>
        </div>
      </Card>
      )}

      {isStudent && (
        <>
          {/* Admission */}
          <Card className="p-6 space-y-4">
            <div className="label-caps text-xs">Admission details</div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Admission No</Label><Input value={form.admission_no} onChange={(e) => setForm({ ...form, admission_no: e.target.value })} /></div>
              <div><Label>Admission Date</Label><Input type="date" value={form.admission_date} onChange={(e) => setForm({ ...form, admission_date: e.target.value })} /></div>
              <div><Label>Date of birth</Label><Input type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} /></div>
            </div>
            <div><Label>Address</Label><Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          </Card>

          {/* Parent */}
          <Card className="p-6 space-y-4">
            <div className="label-caps text-xs">Parent / guardian</div>
            <div><Label>Name</Label><Input value={form.parent_name} onChange={(e) => setForm({ ...form, parent_name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Phone</Label><Input value={form.parent_phone} onChange={(e) => setForm({ ...form, parent_phone: e.target.value })} /></div>
              <div><Label>Email</Label><Input type="email" value={form.parent_email} onChange={(e) => setForm({ ...form, parent_email: e.target.value })} /></div>
            </div>
          </Card>

          {/* Documents */}
          <Card className="p-6 space-y-3">
            <div className="label-caps text-xs">Documents (marksheets, admission letters, etc.)</div>
            <div className="grid grid-cols-[1fr_120px_120px_1fr_auto] gap-2 items-end">
              <div><Label>Title</Label><Input value={docTitle} onChange={(e) => setDocTitle(e.target.value)} placeholder="e.g. Sem 1 Marksheet" /></div>
              <div>
                <Label>Type</Label>
                <select className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm" value={docType} onChange={(e) => setDocType(e.target.value)}>
                  {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <Label>Semester</Label>
                <select
                  className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
                  value={docSemester}
                  onChange={(e) => setDocSemester(e.target.value)}
                >
                  {[1,2,3,4,5,6,7,8].map((n) => <option key={n} value={String(n)}>Sem {n}</option>)}
                </select>
              </div>
              <div><Label>File</Label><Input type="file" ref={docFileRef} /></div>
              <Button onClick={uploadDoc}>Upload</Button>
            </div>
            {docs.length === 0 ? (
              <p className="text-xs text-muted-foreground">No documents yet.</p>
            ) : (
              <div className="border-t border-border divide-y divide-border">
                {docs.map((d) => (
                  <div key={d.id} className="py-2 flex items-center justify-between gap-2 text-sm">
                    <div>
                      <div className="font-medium">{d.title}</div>
                      <div className="text-xs text-muted-foreground">{d.doc_type} · {new Date(d.uploaded_at).toLocaleDateString()}</div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => viewFile(d.file_url)}>View</Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteDoc(d)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      <Button onClick={save}>Save changes</Button>
    </div>
  );
}
