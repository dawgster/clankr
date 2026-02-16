"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, Send, Loader2 } from "lucide-react";
import Link from "next/link";

interface ChatMessage {
  eventId: string;
  sender: string;
  content: string;
  timestamp: number;
  isOwn: boolean;
}

interface RoomState {
  roomId: string;
  matrixUserId: string;
}

interface SyncResponse {
  messages: ChatMessage[];
  nextBatch: string;
}

interface MatrixThreadProps {
  connectionId: string;
  otherUser: {
    username: string;
    profile: {
      displayName: string | null;
      avatarUrl: string | null;
    } | null;
  };
}

export function MatrixThread({ connectionId, otherUser }: MatrixThreadProps) {
  const [input, setInput] = useState("");
  const syncTokenRef = useRef<string | undefined>(undefined);
  const allMessagesRef = useRef<ChatMessage[]>([]);
  const [messageVersion, setMessageVersion] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const profile = otherUser.profile;

  const scrollToBottom = useCallback(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, []);

  // Step 1: Get or create the Matrix DM room for this connection
  const roomQuery = useQuery({
    queryKey: ["matrix-user-room", connectionId],
    queryFn: async () => {
      const res = await fetch("/api/matrix/user-room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create room");
      }
      return res.json() as Promise<RoomState>;
    },
    retry: false,
  });

  const room = roomQuery.data ?? null;

  // Step 2: Poll for messages via /api/matrix/messages
  useQuery({
    queryKey: ["matrix-user-messages", room?.roomId],
    queryFn: async (): Promise<SyncResponse | null> => {
      if (!room) return null;
      const params = new URLSearchParams({ roomId: room.roomId });
      if (syncTokenRef.current) params.set("since", syncTokenRef.current);

      const res = await fetch(`/api/matrix/messages?${params}`);
      if (!res.ok) throw new Error("Failed to fetch messages");
      const data = (await res.json()) as SyncResponse;

      if (data.messages.length > 0) {
        const existingIds = new Set(
          allMessagesRef.current.map((m) => m.eventId),
        );
        const unique = data.messages.filter(
          (m) => !existingIds.has(m.eventId),
        );
        if (unique.length > 0) {
          allMessagesRef.current = [...allMessagesRef.current, ...unique];
          setMessageVersion((v) => v + 1);
        }
      }
      if (data.nextBatch) {
        syncTokenRef.current = data.nextBatch;
      }

      return data;
    },
    enabled: !!room,
    refetchInterval: 3000,
  });

  const messages = useMemo(
    () => allMessagesRef.current,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [messageVersion],
  );

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Step 3: Send messages
  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!room) throw new Error("No room");
      const res = await fetch("/api/matrix/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: room.roomId, content }),
      });
      if (!res.ok) throw new Error("Failed to send message");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["matrix-user-messages"],
      });
    },
  });

  function handleSend() {
    const text = input.trim();
    if (!text || sendMutation.isPending) return;
    setInput("");
    sendMutation.mutate(text);
  }

  // Loading state
  if (roomQuery.isPending || !room) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (roomQuery.error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
        <p className="text-sm text-muted-foreground">
          {roomQuery.error.message}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-4 py-3">
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
            {profile?.displayName || otherUser.username || "User"}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 pt-20 text-muted-foreground">
            <p className="text-sm">
              Send a message to start the conversation.
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.eventId}
              className={`flex ${msg.isOwn ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[70%] rounded-lg px-4 py-2 ${
                  msg.isOwn
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                <p
                  className={`mt-1 text-xs ${
                    msg.isOwn
                      ? "text-primary-foreground/70"
                      : "text-muted-foreground"
                  }`}
                >
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Input */}
      <div className="border-t p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex gap-2"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            disabled={sendMutation.isPending}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || sendMutation.isPending}
          >
            {sendMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
