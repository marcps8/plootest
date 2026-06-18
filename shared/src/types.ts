export type PostStatus =
  | "draft"
  | "scheduled"
  | "publishing"
  | "published"
  | "failed"
  | "cancelled";

export type ErrorCode =
  | "token_revoked"
  | "token_expired"
  | "provider_error"
  | "rate_limited"
  | "provider_unavailable"
  | "invalid_payload";

export interface AuthContext {
  tenantId: string;
  profileId: string;
}

export interface Post {
  id: string;
  tenant_id: string;
  profile_id: string;
  content: string;
  status: PostStatus;
  scheduled_at: string | null;
  external_id: string | null;
  error_code: ErrorCode | null;
  error_detail: string | null;
  publish_attempts: number;
  created_at: string;
  updated_at: string;
}

export interface PostDTO {
  id: string;
  profile_id: string;
  content: string;
  status: PostStatus;
  scheduled_at: string | null;
  external_id: string | null;
  error_code: ErrorCode | null;
  error_detail: string | null;
  created_at: string;
  updated_at: string;
}

export function toPostDTO(row: Post): PostDTO {
  return {
    id: row.id,
    profile_id: row.profile_id,
    content: row.content,
    status: row.status,
    scheduled_at: row.scheduled_at,
    external_id: row.external_id,
    error_code: row.error_code,
    error_detail: row.error_detail,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
