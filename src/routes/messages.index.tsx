import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RequireAuth, useAuth, fetchProfilesByIds, formatDateTime } from "@/lib/app";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/messages/")({
  head: () => ({ meta: [{ title: "Messages - College Portal" }] }),
  component: () => <RequireAuth><Inbox /></RequireAuth>,
});

function Inbox() {
  const { user } = useAuth();
  const [threads, setThreads] = useState<any[]>([]);
  const [profMap, setProfMap] = useState<Map<string, any>>(new Map());
  const [open, setOpen] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from("message_threads").select("*").or(`participant_a.eq.${user.id},participant_b.eq.${user.id}`).order("last_message_at", { ascending: false });
    setThreads(data ?? []);
    const otherIds = (data ?? []).map((t) => (t.participant_a === user.id ? t.participant_b : t.participant_a));
    setProfMap(await fetchProfilesByIds(otherIds));
  };

  useEffect(() => { void load(); }, [user]);

  const startThread = async () => {
    if (!user || !recipientEmail || !body) return toast.error("Fill all fields");
    const ident = recipientEmail.trim();

    const { data: matches } = await supabase
      .from("profiles")
      .select("id")
      .eq("identifier", ident)
      .limit(1);
    const recipientId = matches?.[0]?.id;
    if (!recipientId) return toast.error("No user found with that Roll No or Staff ID");
    if (recipientId === user.id) return toast.error("Cannot message yourself");

    const a = user.id < recipientId ? user.id : recipientId;
    const b = user.id < recipientId ? recipientId : user.id;
    let { data: existing } = await supabase.from("message_threads").select("*").eq("participant_a", a).eq("participant_b", b).maybeSingle();
    if (!existing) {
      const { data: created, error } = await supabase.from("message_threads").insert({ participant_a: a, participant_b: b, subject: subject || null }).select().maybeSingle();
      if (error) return toast.error(error.message);
      existing = created;
    }
    const { error: mErr } = await supabase.from("messages").insert({ thread_id: existing!.id, sender_id: user.id, body });
    if (mErr) return toast.error(mErr.message);
    toast.success("Message sent");
    setOpen(false); setRecipientEmail(""); setSubject(""); setBody("");
    void load();
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <div className="label-caps">Messages</div>
          <h1 className="text-2xl font-semibold">Inbox</h1>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />New</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New message</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Roll No or Staff ID</Label>
                <Input placeholder="e.g. 22BCS1234 or STAFF-019" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} />
              </div>
              <div><Label>Subject</Label><Input value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
              <div><Label>Message</Label><textarea className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm min-h-24" value={body} onChange={(e) => setBody(e.target.value)} /></div>
              <Button className="w-full" onClick={startThread}>Send</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {threads.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">No conversations yet.</Card>
      ) : (
        <div className="space-y-2">
          {threads.map((t) => {
            const otherId = t.participant_a === user?.id ? t.participant_b : t.participant_a;
            const other = profMap.get(otherId);
            return (
              <Link key={t.id} to="/messages/$threadId" params={{ threadId: t.id }}>
                <Card className="p-4 hover:bg-accent/40 cursor-pointer">
                  <div className="flex justify-between gap-4">
                    <div>
                      <Link to="/profile" search={{ id: otherId }} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                        {other?.full_name || "Unknown"}
                      </Link>
                      <div className="text-xs text-muted-foreground">{other?.identifier ? `${other.identifier} · ` : ""}{t.subject || "(no subject)"}</div>
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(t.last_message_at)}</div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
