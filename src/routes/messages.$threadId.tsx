import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RequireAuth, useAuth, fetchProfilesByIds, formatDateTime } from "@/lib/app";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/messages/$threadId")({
  head: () => ({ meta: [{ title: "Conversation - College Portal" }] }),
  component: () => <RequireAuth><Thread /></RequireAuth>,
});

function Thread() {
  const { threadId } = Route.useParams();
  const { user } = useAuth();
  const [thread, setThread] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [profMap, setProfMap] = useState<Map<string, any>>(new Map());
  const [body, setBody] = useState("");

  const load = async () => {
    const { data: t } = await supabase.from("message_threads").select("*").eq("id", threadId).maybeSingle();
    setThread(t);
    if (t) setProfMap(await fetchProfilesByIds([t.participant_a, t.participant_b]));
    const { data: msgs } = await supabase.from("messages").select("*").eq("thread_id", threadId).order("created_at");
    setMessages(msgs ?? []);
    // mark unread as read
    if (user) {
      await supabase.from("messages").update({ read_at: new Date().toISOString() })
        .eq("thread_id", threadId).neq("sender_id", user.id).is("read_at", null);
    }
  };

  useEffect(() => { void load(); }, [threadId, user]);

  const send = async () => {
    if (!user || !body.trim()) return;
    const { error } = await supabase.from("messages").insert({ thread_id: threadId, sender_id: user.id, body: body.trim() });
    if (error) return toast.error(error.message);
    setBody(""); void load();
  };

  if (!thread) return <div className="text-sm text-muted-foreground">Loading…</div>;
  const otherId = thread.participant_a === user?.id ? thread.participant_b : thread.participant_a;
  const other = profMap.get(otherId);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link to="/messages" className="text-xs text-muted-foreground hover:text-foreground">← Inbox</Link>
      <div>
        <div className="label-caps">Conversation</div>
        <h1 className="text-2xl font-semibold">{other?.full_name || "-"}</h1>
        {thread.subject && <p className="text-sm text-muted-foreground">{thread.subject}</p>}
      </div>

      <Card className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No messages yet.</p>
        ) : messages.map((m) => {
          const mine = m.sender_id === user?.id;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] rounded-md px-3 py-2 text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                <p className="whitespace-pre-wrap">{m.body}</p>
                <div className={`text-[10px] mt-1 ${mine ? "text-primary-foreground/60" : "text-muted-foreground"}`}>{formatDateTime(m.created_at)}</div>
              </div>
            </div>
          );
        })}
      </Card>

      <Card className="p-3">
        <textarea
          className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm min-h-20"
          placeholder="Write a message…" value={body} onChange={(e) => setBody(e.target.value)}
        />
        <div className="flex justify-between items-center mt-2">
          <Button variant="ghost" size="sm" onClick={() => void load()}>Refresh</Button>
          <Button onClick={send}>Send</Button>
        </div>
      </Card>
    </div>
  );
}
