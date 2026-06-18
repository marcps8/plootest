import express from "express";
import {
  getPool,
  claimDueScheduledPosts,
  publishClaimedPost,
  recoverStalePublishing,
  RateLimitedError,
  TokenRevokedError,
  ProviderUnavailableError,
} from "@ploot/shared";
import {
  enqueuePublish,
  receivePublishMessages,
  deletePublishMessage,
  parsePublishMessage,
  receiveCount,
  isSqsEnabled,
} from "./sqs.js";
import {
  acquireAmbassadorSlot,
  acquireGlobalSlot,
  releaseAmbassadorSlot,
  releaseGlobalSlot,
} from "./throttle.js";

const pool = getPool();
const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 2000);
const SQS_CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 5);

async function dispatch(message: {
  postId: string;
  profileId: string;
  traceId?: string;
  delaySeconds?: number;
}) {
  if (isSqsEnabled()) {
    await enqueuePublish(
      { postId: message.postId, profileId: message.profileId, traceId: message.traceId },
      message.delaySeconds ?? 0
    );
    return;
  }
  await processPost(message.postId, message.profileId, message.traceId);
}

async function processPost(postId: string, profileId: string, traceId?: string) {
  const globalAcquired = await acquireGlobalSlot();
  if (!globalAcquired) {
    await dispatch({ postId, profileId, traceId, delaySeconds: 2 });
    return;
  }

  const ambassadorAcquired = await acquireAmbassadorSlot(profileId);
  if (!ambassadorAcquired) {
    await releaseGlobalSlot();
    await dispatch({ postId, profileId, traceId, delaySeconds: 5 });
    return;
  }

  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT * FROM posts WHERE id = $1 AND status = 'publishing'`,
      [postId]
    );
    const post = rows[0];
    if (!post) return;

    await publishClaimedPost(client, post as never, traceId);
    logEvent("post_published", { postId, profileId, tenantId: post.tenant_id, traceId });
  } catch (e) {
    if (e instanceof RateLimitedError) {
      await dispatch({ postId, profileId, traceId, delaySeconds: e.retryAfterSeconds });
      logEvent("rate_limited", { postId, profileId, retryAfter: e.retryAfterSeconds, traceId });
      return;
    }
    if (e instanceof TokenRevokedError) {
      logEvent("token_revoked", { postId, profileId, traceId });
      return;
    }
    if (e instanceof ProviderUnavailableError) {
      logEvent("provider_unavailable", { postId, profileId, error: e.message, traceId });
      throw e;
    }
    throw e;
  } finally {
    client.release();
    await releaseAmbassadorSlot(profileId);
    await releaseGlobalSlot();
  }
}

function logEvent(event: string, fields: Record<string, unknown>) {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      service: "ploot-scheduler-worker",
      ddsource: "nodejs",
      event,
      ...fields,
    })
  );
}

async function pollDuePosts() {
  const client = await pool.connect();
  try {
    await recoverStalePublishing(client, 0);
    const claimed = await claimDueScheduledPosts(client, 50);
    for (const post of claimed) {
      const traceId = crypto.randomUUID();
      await dispatch({ postId: post.id, profileId: post.profile_id, traceId });
      logEvent("post_enqueued", {
        postId: post.id,
        profileId: post.profile_id,
        tenantId: post.tenant_id,
        scheduledAt: post.scheduled_at,
        traceId,
        queue: isSqsEnabled() ? "aws-sqs" : "inline",
      });
    }
  } finally {
    client.release();
  }
}

async function consumeSqsLoop() {
  if (!isSqsEnabled()) return;

  for (;;) {
    try {
      const messages = await receivePublishMessages(SQS_CONCURRENCY);
      await Promise.all(
        messages.map(async (msg) => {
          const body = parsePublishMessage(msg);
          if (!body || !msg.ReceiptHandle) return;

          try {
            await processPost(body.postId, body.profileId, body.traceId);
            await deletePublishMessage(msg.ReceiptHandle);
          } catch (e) {
            logEvent("sqs_message_failed", {
              postId: body.postId,
              receiveCount: receiveCount(msg),
              error: e instanceof Error ? e.message : String(e),
            });
          }
        })
      );
    } catch (e) {
      logEvent("sqs_poll_error", { error: e instanceof Error ? e.message : String(e) });
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

setInterval(() => {
  pollDuePosts().catch((e) => logEvent("poll_error", { error: String(e) }));
}, POLL_MS);

pollDuePosts().catch((e) => logEvent("poll_error", { error: String(e) }));
consumeSqsLoop().catch((e) => logEvent("sqs_consumer_error", { error: String(e) }));

const app = express();
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "ploot-scheduler-worker",
    sqs: isSqsEnabled(),
  });
});

const port = Number(process.env.PORT ?? 8080);
app.listen(port, () => {
  logEvent("worker_started", {
    port,
    queue: isSqsEnabled() ? "aws-sqs" : "inline",
    rateLimit: "upstash-redis",
  });
});
