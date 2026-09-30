import { z } from "zod";
export const openingSchema = z.object({
  title: z.string().min(1).max(80),
  titleEn: z.string().min(1).max(120),
  descriptionEn: z.string().min(1).max(300),
  description: z.string().min(1).max(240),
  imagePrompt: z.string().min(10).max(4000),
  videoPrompt: z.string().min(10).max(4000),
});
export type Opening = z.infer<typeof openingSchema>;
export const actionSchema = z.object({
  title: z.string().min(1).max(80),
  titleEn: z.string().min(1).max(120),
  descriptionEn: z.string().min(1).max(300),
  description: z.string().min(1).max(240),
  prompt: z.string().min(5).max(2000),
});
export type AlchemyAction = z.infer<typeof actionSchema>;
export const connectionSchema = z.object({
  protocol: z.literal("webrtc"),
  apiBase: z.string().url(),
  sessionId: z.string(),
  jwt: z.string(),
  modelSlug: z.string(),
});
export type LiveConnection = z.infer<typeof connectionSchema>;
export interface SavedCreation {
  id: string;
  dishId: string;
  baseIngredients?: string[];
  title: string;
  titleEn?: string;
  description: string;
  descriptionEn?: string;
  ingredients: string[];
  animals?: string[];
  createdAt: number;
  imageUrl: string;
  hasVideo: boolean;
}
export interface SessionReply {
  id: string;
  connection: LiveConnection;
  expiresAt: number;
}
