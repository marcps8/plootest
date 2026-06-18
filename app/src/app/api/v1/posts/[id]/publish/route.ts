import { NextRequest } from "next/server";
import {
  PostsRepository,
  verifyAuthHeader,
  toPostDTO,
  withTransaction,
  claimPostForPublishing,
  publishClaimedPost,
  ConflictError,
  ValidationError,
} from "@ploot/shared";
import { jsonData, jsonError } from "@/lib/api";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const auth = await verifyAuthHeader(req.headers.get("authorization"));
    const { id } = await params;
    const idempotencyKey = req.headers.get("idempotency-key");

    if (!idempotencyKey) {
      throw new ValidationError("Idempotency-Key header is required");
    }

    const repo = new PostsRepository(auth);
    const cached = await repo.getIdempotencyResponse(idempotencyKey);
    if (cached) {
      return jsonData(cached);
    }

    const existing = await repo.getById(id);
    if (existing.status === "published") {
      const response = toPostDTO(existing);
      await repo.saveIdempotencyResponse(idempotencyKey, existing.id, response);
      return jsonData(response);
    }
    if (existing.status === "publishing") {
      throw new ConflictError("Post is already being published");
    }

    const traceId = req.headers.get("traceparent") ?? crypto.randomUUID();

    const post = await withTransaction(async (client) => {
      const claimed = await claimPostForPublishing(client, id, auth.tenantId);
      if (!claimed) {
        throw new ConflictError("Post is not available for publishing");
      }
      const outcome = await publishClaimedPost(client, claimed, traceId);
      return outcome.post;
    });

    const response = toPostDTO(post);
    await repo.saveIdempotencyResponse(idempotencyKey, post.id, response);
    return jsonData(response);
  } catch (e) {
    return jsonError(e);
  }
}
