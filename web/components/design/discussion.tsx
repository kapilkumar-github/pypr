"use client"

import { useEffect, useRef, useState } from "react"
import { Send } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { errorMessage } from "@/lib/api/client"
import { useDesignChat, useMessages, type Ask, type DiscussionMessage, type Evaluation } from "@/lib/api/design"
import { cn } from "@/lib/utils"

function Dots({ n }: { n: number }) {
  return (
    <span className="font-mono text-xs tracking-tight text-primary" aria-label={`${n} of 5`}>
      {"●".repeat(n)}
      <span className="text-muted-foreground/40">{"●".repeat(5 - n)}</span>
    </span>
  )
}

function List({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null
  return (
    <div>
      <p className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">{title}</p>
      <ul className="list-disc space-y-0.5 pl-5">{items.map((x) => <li key={x}>{x}</li>)}</ul>
    </div>
  )
}

function EvaluationCard({ e }: { e: Evaluation }) {
  return (
    <div className="space-y-3 text-sm">
      <p>{e.summary}</p>
      <ul className="space-y-1.5">
        {e.scores.map((s) => (
          <li key={s.area}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{s.area}</span>
              <Dots n={s.score} />
            </div>
            <p className="text-xs text-muted-foreground">{s.comment}</p>
          </li>
        ))}
      </ul>
      <List title="Covered" items={e.covered} />
      <List title="Gaps" items={e.gaps} />
      <List title="Follow-up questions" items={e.followups} />
    </div>
  )
}

function Bubble({ m }: { m: DiscussionMessage }) {
  const mine = m.role === "user"
  return (
    <li className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[95%] rounded-lg px-3 py-2 text-sm", mine ? "bg-primary text-primary-foreground" : "border bg-muted/40")}>
        {m.kind === "explanation" && <p className="mb-1 text-[11px] font-bold tracking-wider uppercase opacity-80">My design, in words</p>}
        {m.kind === "evaluation" && m.result ? <EvaluationCard e={m.result} /> : <p className="whitespace-pre-wrap">{m.content}</p>}
      </div>
    </li>
  )
}

/** The chat with the AI interviewer: the evaluation, its follow-up questions and the learner's answers. */
export function Discussion({ workspaceId, boardId, ask, evaluating }: { workspaceId: string; boardId: string; ask: Ask; evaluating: boolean }) {
  const messages = useMessages(workspaceId, boardId)
  const chat = useDesignChat(workspaceId, boardId)
  const [text, setText] = useState("")
  const end = useRef<HTMLLIElement>(null)
  const count = (messages.data?.length ?? 0) + (evaluating ? 1 : 0)
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" })
  }, [count])

  const send = () => {
    const message = text.trim()
    if (!message || chat.isPending) return
    chat.mutate({ message, ...ask }, { onSuccess: () => setText("") })
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {messages.isPending ? (
        <Skeleton className="h-24" />
      ) : (
        <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto">
          {messages.data?.length === 0 && !evaluating && (
            <li className="text-sm text-muted-foreground">
              Press <strong>Evaluate</strong> to have your design reviewed against the question. The interviewer asks follow-up questions here, and you can answer or ask back.
            </li>
          )}
          {messages.data?.map((m) => <Bubble key={m.id} m={m} />)}
          {evaluating && <li className="text-sm text-muted-foreground">Reviewing your design…</li>}
          <li ref={end} />
        </ul>
      )}
      {chat.isError && <p role="alert" className="text-xs text-destructive">{errorMessage(chat.error) ?? "Couldn't send."}</p>}
      {(
        <div className="flex items-end gap-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            placeholder="Answer a follow-up or ask a question"
            maxLength={1500}
            rows={2}
            aria-label="Message"
            className="max-h-32 min-h-10 resize-none"
          />
          <Button size="icon" onClick={send} disabled={!text.trim() || chat.isPending} aria-label="Send">
            <Send />
          </Button>
        </div>
      )}
    </div>
  )
}
