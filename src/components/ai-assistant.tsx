"use client"

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react"
import { Bot, LoaderCircle, Send, Sparkles, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

type ChatMessage = {
  role: "user" | "model"
  content: string
}

const suggestions = [
  "Why might a pod be stuck in Pending?",
  "How do I safely troubleshoot a failed deployment?",
  "Explain Kubernetes services in simple terms."
]

export function AiAssistant() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)
  const conversationRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    conversationRef.current?.scrollTo({
      top: conversationRef.current.scrollHeight,
      behavior: "smooth"
    })
  }, [messages, isSending])

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const content = input.trim()
    if (!content || isSending) return

    const conversation = [
      ...messages.slice(-18),
      { role: "user" as const, content }
    ]
    setMessages([...conversation, { role: "model", content: "" }])
    setInput("")
    setError(null)
    setIsSending(true)

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: conversation })
      })

      if (!response.ok) {
        const responseBody = await response.json().catch(() => null)
        throw new Error(responseBody?.error || `Chat request failed (${response.status}).`)
      }

      if (!response.body) throw new Error("The AI service returned no response stream.")

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let answer = ""
      const appendAnswer = (chunk: string) => {
        answer += chunk
        setMessages((current) => current.map((message, index) =>
          index === current.length - 1 ? { ...message, content: answer } : message
        ))
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        appendAnswer(decoder.decode(value, { stream: true }))
      }

      appendAnswer(decoder.decode())
      if (!answer.trim()) throw new Error("The AI service returned an empty response. Please try again.")
    } catch (chatError) {
      setMessages((current) => current.filter((message, index) =>
        index !== current.length - 1 || message.content.length > 0
      ))
      setError(chatError instanceof Error ? chatError.message : "The chat request failed. Please try again.")
    } finally {
      setIsSending(false)
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          className="fixed bottom-5 right-5 z-40 h-11 rounded-full px-4 shadow-lg"
          aria-label="Open AI Kubernetes assistant"
        >
          <Bot className="size-4" />
          AI Assistant
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[calc(100%-1rem)] sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="size-4" />
            </span>
            Kubernetes AI Assistant
          </SheetTitle>
          <SheetDescription>
            Ask about Kubernetes, deployments, troubleshooting, or this dashboard. Replies stream in as they are generated.
          </SheetDescription>
        </SheetHeader>

        <div
          ref={conversationRef}
          className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4"
          aria-live="polite"
          aria-label="Chat conversation"
        >
          {messages.length === 0 ? (
            <div className="my-auto space-y-4">
              <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Bot className="size-6" />
              </div>
              <p className="text-center text-sm font-semibold">What can I help you with?</p>
              <div className="space-y-2">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setInput(suggestion)}
                    className="w-full rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message, index) => (
              <div
                key={`${index}-${message.role}`}
                className={`max-w-[88%] rounded-xl px-3 py-2.5 text-sm ${
                  message.role === "user"
                    ? "self-end bg-primary text-primary-foreground"
                    : "self-start border border-border/70 bg-muted/50 text-foreground"
                }`}
              >
                {message.content ? (
                  <p className="whitespace-pre-wrap break-words">{message.content}</p>
                ) : isSending && index === messages.length - 1 ? (
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <LoaderCircle className="size-3.5 animate-spin" />
                    Thinking...
                  </span>
                ) : null}
              </div>
            ))
          )}
          {error && (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}
        </div>

        <div className="space-y-2 border-t border-border/60 p-4">
          {messages.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={isSending}
              onClick={() => {
                setMessages([])
                setError(null)
              }}
            >
              <Trash2 className="size-3" />
              Clear conversation
            </Button>
          )}
          <form onSubmit={sendMessage} className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a Kubernetes question…"
              aria-label="Message the Kubernetes AI assistant"
              maxLength={4000}
              rows={2}
              disabled={isSending}
              className="min-h-10 resize-none rounded-lg text-sm"
            />
            <Button
              type="submit"
              size="icon"
              aria-label="Send message"
              disabled={!input.trim() || isSending}
            >
              {isSending ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
            </Button>
          </form>
          <p className="text-[10px] text-muted-foreground">
            Don’t send passwords, API keys, or other sensitive information.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  )
}
