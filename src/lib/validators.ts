import { z } from "zod";

export const profileSchema = z.object({
  displayName: z.string().min(1).max(100),
  bio: z.string().max(500).optional().default(""),
  intent: z.string().max(1000).optional().default(""),
  interests: z.array(z.string().max(50)).max(20).optional().default([]),
  lookingFor: z.array(z.string().max(50)).max(10).optional().default([]),
  links: z
    .array(z.object({ label: z.string(), url: z.string().url() }))
    .max(10)
    .optional()
    .default([]),
});

export const connectionRequestSchema = z.object({
  toUserId: z.string().min(1),
  category: z
    .enum([
      "NETWORKING",
      "COLLABORATION",
      "HIRING",
      "BUSINESS",
      "SOCIAL",
      "OTHER",
    ])
    .optional()
    .default("OTHER"),
  intent: z.string().min(1).max(1000),
});

export const directMessageSchema = z.object({
  content: z.string().min(1).max(5000),
});

// ── Agent BYOA schemas ──

export const agentRegisterSchema = z.object({
  name: z.string().min(1).max(100),
});

export const agentClaimSchema = z.object({
  claimToken: z.string().min(1),
});

export const agentGatewaySchema = z.object({
  gatewayUrl: z.string().url().nullable(),
  gatewayToken: z.string().max(500).nullable().optional(),
  webhookEnabled: z.boolean(),
});

export const agentDecideSchema = z.object({
  decision: z.enum(["ACCEPT", "REJECT", "ASK_MORE"]),
  confidence: z.number().min(0).max(1).optional(),
  reason: z.string().max(2000).optional(),
});

export const agentReplySchema = z.object({
  content: z.string().min(1).max(5000),
});

export const agentTransferSchema = z.object({
  recipientUserId: z.string().min(1),
  amount: z.string().min(1).max(50), // NEAR amount as string, e.g. "0.5"
});

export type ProfileInput = z.infer<typeof profileSchema>;
export type ConnectionRequestInput = z.infer<typeof connectionRequestSchema>;
export type DirectMessageInput = z.infer<typeof directMessageSchema>;
export type AgentRegisterInput = z.infer<typeof agentRegisterSchema>;
export type AgentClaimInput = z.infer<typeof agentClaimSchema>;
export type AgentGatewayInput = z.infer<typeof agentGatewaySchema>;
export type AgentDecideInput = z.infer<typeof agentDecideSchema>;
export type AgentTransferInput = z.infer<typeof agentTransferSchema>;
