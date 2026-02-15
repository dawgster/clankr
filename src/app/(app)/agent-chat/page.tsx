"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useUser } from "@clerk/nextjs";
import { Bot, Send, User, Loader2, AlertCircle } from "lucide-react";

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

export default function AgentChatPage() {
  const { user: clerkUser } = useUser();
  const [input, setInput] = useState("");
  const syncTokenRef = useRef<string | undefined>(undefined);
  const allMessagesRef = useRef<ChatMessage[]>([]);
  const [messageVersion, setMessageVersion] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const scrollToBottom = useCallback(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, []);

  // Step 1: Create or get the DM room
  const roomQuery = useQuery({
    queryKey: ["matrix-room"],
    queryFn: async () => {
      const res = await fetch("/api/matrix/room", { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create room");
      }
      return res.json() as Promise<RoomState>;
    },
    retry: false,
  });

  const room = roomQuery.data ?? null;

  // Step 2: Poll for messages
  useQuery({
    queryKey: ["matrix-messages", room?.roomId],
    queryFn: async (): Promise<SyncResponse | null> => {
      if (!room) return null;
      const params = new URLSearchParams({ roomId: room.roomId });
      if (syncTokenRef.current) params.set("since", syncTokenRef.current);

      const res = await fetch(`/api/matrix/messages?${params}`);
      if (!res.ok) throw new Error("Failed to fetch messages");
      const data = (await res.json()) as SyncResponse;

      // Accumulate messages via ref to avoid setState-in-effect
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
      queryClient.invalidateQueries({ queryKey: ["matrix-messages"] });
    },
  });

  function handleSend() {
    const text = input.trim();
    if (!text || sendMutation.isPending) return;
    setInput("");
    sendMutation.mutate(text);
  }

  // Error states
  if (roomQuery.error) {
    const errorMsg = roomQuery.error.message;
    const isNoAgent = errorMsg.includes("No agent connected");
    const isNoMatrix = errorMsg.includes("Matrix account");

    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
        <AlertCircle className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-lg font-semibold">
          {isNoAgent ? "No Agent Connected" : "Agent Chat Unavailable"}
        </h2>
        <p className="max-w-md text-center text-sm text-muted-foreground">
          {isNoAgent
            ? "Connect an agent to your account first, then come back to chat with it."
            : isNoMatrix
              ? "Your agent doesn't have a Matrix account yet. This is provisioned automatically when you claim an agent."
              : errorMsg}
        </p>
      </div>
    );
  }

  // Loading state
  if (roomQuery.isPending || !room) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <Bot className="h-5 w-5 text-primary" />
        <div>
          <p className="text-sm font-medium">Agent Chat</p>
          <p className="text-xs text-muted-foreground">
            Direct conversation with your agent via Matrix
          </p>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 pt-20 text-muted-foreground">
            <Bot className="h-10 w-10" />
            <p className="text-sm">
              Send a message to start chatting with your agent.
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.eventId}
              className={`flex ${msg.isOwn ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-4 py-2 ${
                  msg.isOwn
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                <div className="mb-1 flex items-center gap-1.5">
                  <Avatar className="h-4 w-4">
                    {msg.isOwn && clerkUser?.imageUrl && (
                      <AvatarImage src={clerkUser.imageUrl} />
                    )}
                    <AvatarFallback className="text-[8px]">
                      {msg.isOwn ? (
                        <User className="h-3 w-3" />
                      ) : (
                        <Bot className="h-3 w-3" />
                      )}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-[10px] font-medium uppercase opacity-70">
                    {msg.isOwn ? "You" : "Agent"}
                  </span>
                </div>
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
