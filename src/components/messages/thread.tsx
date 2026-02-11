"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, Send } from "lucide-react";
import Link from "next/link";
import { sendMessage } from "@/lib/actions/message";
import type { DirectMessage, User, Profile } from "@/generated/prisma/client";

type MessageWithSender = DirectMessage & {
  sender: User & { profile: Profile | null };
};

interface MessageThreadProps {
  threadId: string;
  currentUserId: string;
  otherUser: (User & { profile: Profile | null }) | null;
  initialMessages: MessageWithSender[];
}

export function MessageThread({
  threadId,
  currentUserId,
  otherUser,
  initialMessages,
}: MessageThreadProps) {
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const profile = otherUser?.profile;

  const scrollToBottom = useCallback(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Poll for new messages
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/messages?threadId=${threadId}&after=${messages[messages.length - 1]?.id || ""}`,
        );
        const data = await res.json();
        if (data.length > 0) {
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const newMsgs = data.filter(
              (m: MessageWithSender) => !existingIds.has(m.id),
            );
            return [...prev, ...newMsgs];
          });
        }
      } catch {
        // Ignore polling errors
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [threadId, messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const content = input.trim();
    setInput("");
    setLoading(true);

    try {
      const msg = await sendMessage(threadId, content);
      setMessages((prev) => [...prev, msg as MessageWithSender]);
    } catch (err) {
      console.error(err);
      setInput(content);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col px-4">
      {/* Header */}
      <div className="flex items-center gap-3 border-b py-3">
        <Link href="/messages" className="md:hidden">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <Avatar>
          <AvatarImage src={profile?.avatarUrl || undefined} />
          <AvatarFallback>
            {profile?.displayName?.slice(0, 2).toUpperCase() || "??"}
          </AvatarFallback>
        </Avatar>
        <div>
          <p className="font-medium">
            {profile?.displayName || otherUser?.username || "User"}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto py-4">
        {messages.map((msg) => {
          const isMine = msg.senderId === currentUserId;
          return (
            <div
              key={msg.id}
              className={`flex ${isMine ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[70%] rounded-lg px-4 py-2 ${
                  isMine
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                <p className="text-sm">{msg.content}</p>
                <p
                  className={`mt-1 text-xs ${
                    isMine
                      ? "text-primary-foreground/70"
                      : "text-muted-foreground"
                  }`}
                >
                  {new Date(msg.createdAt).toLocaleTimeString()}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="flex gap-2 border-t pt-4">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          disabled={loading}
        />
        <Button type="submit" size="icon" disabled={loading || !input.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
