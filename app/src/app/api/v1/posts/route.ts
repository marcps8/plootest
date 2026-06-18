import { NextRequest } from "next/server";
import { PostsRepository, verifyAuthHeader, toPostDTO } from "@ploot/shared";
import { jsonData, jsonError } from "@/lib/api";
import { createPostSchema, listPostsSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAuthHeader(req.headers.get("authorization"));
    const params = Object.fromEntries(req.nextUrl.searchParams.entries());
    const query = listPostsSchema.parse(params);
    const repo = new PostsRepository(auth);
    const { items, nextCursor } = await repo.list(query);
    return jsonData({
      items: items.map(toPostDTO),
      next_cursor: nextCursor,
    });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAuthHeader(req.headers.get("authorization"));
    const body = createPostSchema.parse(await req.json());
    const repo = new PostsRepository(auth);
    const post = await repo.create(body);
    return jsonData(toPostDTO(post), 201);
  } catch (e) {
    return jsonError(e);
  }
}
