import { NextRequest } from "next/server";
import { PostsRepository, verifyAuthHeader, toPostDTO } from "@ploot/shared";
import { jsonData, jsonError } from "@/lib/api";
import { updatePostSchema } from "@/lib/validation";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const auth = await verifyAuthHeader(req.headers.get("authorization"));
    const { id } = await params;
    const body = updatePostSchema.parse(await req.json());
    const repo = new PostsRepository(auth);
    const post = await repo.update(id, body);
    return jsonData(toPostDTO(post));
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const auth = await verifyAuthHeader(_req.headers.get("authorization"));
    const { id } = await params;
    const repo = new PostsRepository(auth);
    const post = await repo.cancel(id);
    return jsonData(toPostDTO(post));
  } catch (e) {
    return jsonError(e);
  }
}
