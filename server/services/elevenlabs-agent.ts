import https from "https";

const DEFAULT_AGENT_ID = "agent_2101m6ev9kr8faptzanfqb0hyge0";

function httpsGet(url: string, headers: Record<string, string>, redirects = 0): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    if (redirects > 5) {
      reject(new Error("Ses servisi çok fazla yönlendirme yaptı."));
      return;
    }
    const request = https.get(url, { headers }, (response) => {
      const status = response.statusCode ?? 0;
      const location = response.headers.location;
      if (status >= 300 && status < 400 && location) {
        response.resume();
        httpsGet(new URL(location, url).href, headers, redirects + 1).then(resolve, reject);
        return;
      }
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("error", reject);
      response.on("end", () => {
        resolve({ status, body: Buffer.concat(chunks).toString("utf8") });
      });
    });
    request.setTimeout(15000, () => {
      request.destroy();
      reject(new Error("Ses servisi yanıt vermedi."));
    });
    request.on("error", () => reject(new Error("Ses servisine bağlanılamadı.")));
  });
}

function sessionFailure(status: number, body: string): string {
  let detail = "";
  try {
    const parsed = JSON.parse(body) as { detail?: unknown; message?: unknown };
    const raw = parsed.detail ?? parsed.message;
    if (typeof raw === "string") detail = raw;
    else if (raw && typeof raw === "object" && "message" in raw && typeof raw.message === "string") {
      detail = raw.message;
    }
  } catch {
    detail = "";
  }
  detail = detail.replace(/wss?:\/\/\S+/gi, "").replace(/https?:\/\/\S+/gi, "").replace(/\s+/g, " ").trim().slice(0, 160);
  return detail ? `Ses oturumu açılamadı (${status}: ${detail}).` : `Ses oturumu açılamadı (${status}).`;
}

export async function createAgentSignedUrl(): Promise<string> {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("ElevenLabs anahtarı tanımlı değil. .env dosyasına ELEVENLABS_API_KEY ekleyin.");
  }
  const agentId = process.env.ELEVENLABS_AGENT_ID?.trim() || DEFAULT_AGENT_ID;
  const url = `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`;
  let lastError = "Ses oturumu açılamadı.";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { status, body } = await httpsGet(url, {
      "xi-api-key": apiKey,
      Accept: "application/json",
    });
    let signedUrl = "";
    try {
      const parsed = JSON.parse(body) as { signed_url?: unknown };
      if (typeof parsed.signed_url === "string") signedUrl = parsed.signed_url;
    } catch {
      signedUrl = "";
    }
    if (status === 401) throw new Error("ElevenLabs anahtarı geçersiz.");
    if (status === 200 && signedUrl.startsWith("wss://")) return signedUrl;
    lastError = sessionFailure(status, body);
    const retryable = status === 429 || status >= 500 || status === 0;
    if (!retryable || attempt === 2) break;
    await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
  }
  throw new Error(lastError);
}
