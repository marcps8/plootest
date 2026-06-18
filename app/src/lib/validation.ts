import { z } from "zod";

export const createPostSchema = z.object({
  content: z.string().min(1).max(10_000),
  status: z.enum(["draft", "scheduled"]).optional(),
  scheduled_at: z.string().optional(),
});

export const updatePostSchema = z.object({
  content: z.string().min(1).max(10_000).optional(),
  status: z.enum(["draft", "scheduled"]).optional(),
  scheduled_at: z.string().optional().nullable(),
});

export const listPostsSchema = z.object({
  status: z
    .enum(["draft", "scheduled", "publishing", "published", "failed", "cancelled"])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
});
