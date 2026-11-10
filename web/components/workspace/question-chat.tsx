"use client"

import { useEffect, useRef, useState } from "react"
import { LoaderCircle, Send } from "lucide-react"

import { useVerified, verifyFirst } from "@/components/app/verify-email"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { errorMessage, fieldErrors } from "@/lib/api/client"
import { useChat, useSendChat } from "@/lib/api/mcq"
import { cn } from "@/lib/utils"

/** Chat about one answered question. The server keeps it on this question; the parent re-keys it per question. */
export function QuestionChat({ workspaceId, testId, position, number }: { workspaceId: string; testId: string; position: number; number: number }) {
  const verified = useVerified()
  const history = useChat(workspaceId, testId, position, true)
  const send = useSendChat(workspaceId, testId, position)
  const [text, setText] = useState("")
  const end = useRef<HTMLDivElement>(null)
  const error = send.isError ? (fieldErrors(send.error).message ?? errorMessage(send.error) ?? "Couldn't send that.") : null

  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" })
  }, [history.data?.length, send.isPending])

  return (
    <section className="flex h-[32rem] max-h-[calc(100svh-6rem)] flex-col rounded-xl border bg-card shadow-xs">
      <div className="border-b px-4 py-3">
        <h3 className="text-sm font-semibold">Ask about question {number}</h3>
        <p className="text-xs text-muted-foreground">Why an option is right or wrong, or the idea behind it. Other topics aren&apos;t answered.</p>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3" aria-live="polite">
        {history.isPending ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : history.data?.length === 0 && !send.isPending ? (
          <p className="text-sm text-muted-foreground">No messages yet. Ask anything about this question.</p>
        ) : (
          history.data?.map((m, n) => (
            <p key={n} className={cn("max-w-[90%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm", m.role === "user" ? "ml-auto bg-primary text-primary-foreground" : "border bg-muted/40")}>
              {m.content}
            </p>
          ))
        )}
        {send.isPending && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <LoaderCircle className="size-3.5 animate-spin" /> Thinking…
          </p>
        )}
        <div ref={end} />
      </div>
      {error && <p className="px-3 pb-1 text-xs text-destructive">{error}</p>}
      <form
        className="flex gap-2 border-t p-3"
        onSubmit={(e) => {
          e.preventDefault()
          const message = text.trim()
          if (!message) return
          if (!verified) return verifyFirst()
          send.mutate(message, { onSuccess: () => setText("") })
        }}
      >
        <Input value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder="Ask a question" aria-label="Your question" disabled={send.isPending} />
        <Button type="submit" size="icon" disabled={!text.trim() || send.isPending} aria-label="Send">
          <Send />
        </Button>
      </form>
    </section>
  )
}
