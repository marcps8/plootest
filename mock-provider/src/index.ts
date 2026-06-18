import express from "express";

const app = express();
app.use(express.json());

type TokenState = "valid" | "expired" | "revoked";

const tokens = new Map<string, TokenState>([
  ["valid-token", "valid"],
  ["expired-token", "expired"],
  ["revoked-token", "revoked"],
]);

const publishCounts = new Map<string, number>();
const deterministic = process.env.DETERMINISTIC === "1";

function latency(): Promise<void> {
  if (deterministic) return Promise.resolve();
  const ms = Math.floor(Math.random() * 3000);
  return new Promise((r) => setTimeout(r, ms));
}

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/provider/publish", async (req, res) => {
  await latency();
  const auth = req.headers.authorization ?? "";
  const token = auth.replace("Bearer ", "");
  const scenario = req.headers["x-test-scenario"] as string | undefined;

  if (token === "revoked-token" || tokens.get(token) === "revoked") {
    return res.status(401).json({ error: "token_revoked" });
  }
  if (token === "expired-token" || tokens.get(token) === "expired") {
    return res.status(401).json({ error: "token_expired" });
  }

  if (scenario === "429") {
    res.set("Retry-After", "2");
    return res.status(429).json({ error: "rate_limited" });
  }
  if (scenario === "503") {
    return res.status(503).json({ error: "provider_unavailable" });
  }

  if (!deterministic) {
    const roll = Math.random();
    if (roll < 0.1) {
      res.set("Retry-After", String(Math.floor(Math.random() * 30) + 1));
      return res.status(429).json({ error: "rate_limited" });
    }
    if (roll < 0.15) {
      return res.status(503).json({ error: "provider_unavailable" });
    }
  }

  const contentKey = JSON.stringify(req.body);
  const count = (publishCounts.get(contentKey) ?? 0) + 1;
  publishCounts.set(contentKey, count);

  return res.status(200).json({ external_id: `ext_${contentKey.slice(0, 8)}_${count}` });
});

app.post("/provider/oauth/refresh", async (req, res) => {
  await latency();
  const { refresh_token } = req.body ?? {};
  if (refresh_token === "revoked" || refresh_token === "revoked-token") {
    return res.status(401).json({ error: "token_revoked" });
  }
  tokens.set("refreshed-token", "valid");
  return res.status(200).json({
    access_token: "refreshed-token",
    expires_in: 3600,
  });
});

app.get("/provider/publish-count", (req, res) => {
  res.json({ counts: Object.fromEntries(publishCounts) });
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => console.log(`mock provider on :${port}`));
