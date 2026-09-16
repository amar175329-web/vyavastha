"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Send,
  Sparkles,
  BookOpen,
  Brain,
  CheckSquare,
  ExternalLink,
  ChevronRight,
  Info,
  RotateCcw,
} from "lucide-react";
import { AppShell } from "@/components/navigation/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SlideOver } from "@/components/ui/slide-over";
import { EmptyState } from "@/components/ui/empty-state";

interface Citation {
  id: string;
  type: "knowledge" | "memory" | "task";
  title: string;
  snippet: string;
  url?: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  timestamp: string;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeCitation, setActiveCitation] = useState<Citation | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const samplePrompts = [
    "What did I read this week about software architecture?",
    "Show pending tasks and intentions in motion",
    "What are my confirmed preferences and identity facts?",
    "Synthesize my recent notes on systems design",
  ];

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        200
      )}px`;
    }
  }, [input]);

  async function handleSend(text?: string) {
    const messageToSend = text || input;
    if (!messageToSend.trim() || loading) return;

    const userMessage: Message = {
      id: `msg_${Date.now()}_user`,
      role: "user",
      content: messageToSend.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: messageToSend }),
      });

      if (!res.ok) {
        throw new Error("Chat request failed");
      }

      const data = await res.json();
      const assistantMessage: Message = {
        id: `msg_${Date.now()}_assistant`,
        role: "assistant",
        content: data.response,
        citations: data.citations || [],
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      const errorMessage: Message = {
        id: `msg_${Date.now()}_err`,
        role: "assistant",
        content: "Unable to process message. Please ensure the Turso database and web server are reachable.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <AppShell
      title="Chat"
      subtitle="Primary Doorway into Personal Knowledge"
      actionButton={
        messages.length > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMessages([])}
            icon={<RotateCcw className="w-3.5 h-3.5" />}
          >
            Clear
          </Button>
        ) : undefined
      }
    >
      <div className="max-w-4xl mx-auto flex flex-col h-[calc(100vh-3.5rem)] px-4 sm:px-6">
        {/* Messages List Area */}
        <div className="flex-1 overflow-y-auto py-6 space-y-6">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center">
              <EmptyState
                icon={<Sparkles className="w-5 h-5 text-amber-400" />}
                badge="Truthful Retrieval"
                title="Personal Knowledge Assistant"
                description="Query across your saved knowledge items, personal memory assertions, and actionable intentions. Responses are strictly grounded in your real ingested items with explicit citations."
                action={
                  <div className="flex flex-col gap-2 w-full max-w-md pt-2">
                    <div className="text-[11px] font-mono text-text-tertiary uppercase tracking-wider text-left mb-1">
                      Suggested Inquiries:
                    </div>
                    {samplePrompts.map((prompt) => (
                      <button
                        key={prompt}
                        onClick={() => handleSend(prompt)}
                        className="text-left px-3 py-2 rounded border border-border-subtle bg-surface hover:bg-card hover:border-border-focus transition-all text-xs text-text-secondary hover:text-text-primary group flex items-center justify-between"
                      >
                        <span className="truncate">{prompt}</span>
                        <ChevronRight className="w-3 h-3 text-text-tertiary group-hover:text-text-primary shrink-0 ml-2" />
                      </button>
                    ))}
                  </div>
                }
              />
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    msg.role === "user" ? "items-end" : "items-start"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1.5 px-1 text-[11px] font-mono text-text-tertiary">
                    <span>{msg.role === "user" ? "You" : "VYAVASTHA"}</span>
                    <span>•</span>
                    <span>{msg.timestamp}</span>
                  </div>

                  <div
                    className={`max-w-2xl rounded-lg p-4 text-xs sm:text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-card border border-border-focus text-text-primary rounded-tr-none"
                        : "bg-surface border border-border-subtle text-text-primary rounded-tl-none shadow-sm"
                    }`}
                  >
                    <div className="whitespace-pre-wrap font-sans">
                      {msg.content}
                    </div>

                    {/* Citations / Provenance Attribution Pills */}
                    {msg.citations && msg.citations.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-border-subtle space-y-2">
                        <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-text-tertiary">
                          <Info className="w-3 h-3" />
                          <span>Source Citations ({msg.citations.length})</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {msg.citations.map((c) => {
                            const variant =
                              c.type === "knowledge"
                                ? "knowledge"
                                : c.type === "memory"
                                ? "memory"
                                : "tasks";
                            const Icon =
                              c.type === "knowledge"
                                ? BookOpen
                                : c.type === "memory"
                                ? Brain
                                : CheckSquare;

                            return (
                              <button
                                key={c.id}
                                onClick={() => setActiveCitation(c)}
                                className="group inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-border-subtle bg-card hover:border-border-focus transition-all text-left"
                              >
                                <Icon className="w-3 h-3 text-text-tertiary group-hover:text-text-primary shrink-0" />
                                <span className="text-[11px] font-medium text-text-secondary group-hover:text-text-primary truncate max-w-[180px]">
                                  {c.title}
                                </span>
                                <Badge variant={variant} size="sm">
                                  {c.type}
                                </Badge>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex flex-col items-start">
                  <div className="flex items-center gap-2 mb-1.5 px-1 text-[11px] font-mono text-text-tertiary">
                    <span>VYAVASTHA</span>
                    <span>•</span>
                    <span>Synthesizing...</span>
                  </div>
                  <div className="p-4 rounded-lg rounded-tl-none bg-surface border border-border-subtle flex items-center gap-2 text-xs text-text-secondary font-mono">
                    <span className="w-2 h-2 rounded-full bg-accent-knowledge animate-pulse" />
                    <span>Searching personal knowledge base & memory layers...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input Bar Area */}
        <div className="pb-6 pt-2">
          <div className="relative rounded-lg border border-border-subtle bg-surface focus-within:border-border-focus focus-within:ring-1 focus-within:ring-border-focus shadow-lg p-2 flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask your personal knowledge base... (Press Enter to send, Shift+Enter for newline)"
              rows={1}
              className="flex-1 bg-transparent px-3 py-2 text-xs sm:text-sm text-text-primary placeholder:text-text-tertiary resize-none focus:outline-none max-h-48 leading-relaxed font-sans"
            />
            <Button
              variant="primary"
              size="sm"
              onClick={() => handleSend()}
              disabled={!input.trim() || loading}
              loading={loading}
              className="mb-0.5 shrink-0"
              icon={<Send className="w-3.5 h-3.5" />}
            >
              Send
            </Button>
          </div>
          <div className="flex items-center justify-between px-2 pt-2 text-[10px] font-mono text-text-tertiary">
            <span>Obsidian Workshop • Gated Private Session</span>
            <span>↵ Enter to Send</span>
          </div>
        </div>
      </div>

      {/* Citation Slide-Over Detail Drawer */}
      <SlideOver
        isOpen={Boolean(activeCitation)}
        onClose={() => setActiveCitation(null)}
        title={activeCitation?.title || "Citation Details"}
        subtitle={`Layer: ${activeCitation?.type?.toUpperCase() || ""}`}
      >
        {activeCitation && (
          <div className="space-y-4">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-text-tertiary mb-1">
                Citation Type
              </div>
              <Badge
                variant={
                  activeCitation.type === "knowledge"
                    ? "knowledge"
                    : activeCitation.type === "memory"
                    ? "memory"
                    : "tasks"
                }
                size="md"
              >
                {activeCitation.type.toUpperCase()}
              </Badge>
            </div>

            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-text-tertiary mb-1">
                Matched Snippet
              </div>
              <div className="p-3 rounded border border-border-subtle bg-card text-xs text-text-secondary leading-relaxed font-mono whitespace-pre-wrap">
                {activeCitation.snippet}
              </div>
            </div>

            {activeCitation.url && (
              <div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-text-tertiary mb-1">
                  Source Provenance URL
                </div>
                <a
                  href={activeCitation.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-accent-tasks hover:underline font-mono break-all"
                >
                  <ExternalLink className="w-3 h-3 shrink-0" />
                  <span>{activeCitation.url}</span>
                </a>
              </div>
            )}

            <div className="pt-4 border-t border-border-subtle">
              <div className="text-[10px] font-mono text-text-tertiary">
                Reference ID: <span className="text-text-secondary">{activeCitation.id}</span>
              </div>
            </div>
          </div>
        )}
      </SlideOver>
    </AppShell>
  );
}
