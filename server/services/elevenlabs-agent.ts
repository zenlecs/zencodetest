import https from "https";

const DEFAULT_AGENT_ID = "agent_8301m6edqywaf10av8gnb1st0562";

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
    request.on("error", () => reject(new Error("Ses servisine bağlanılamadı.")));
  });
}

export async function createAgentSignedUrl(): Promise<string> {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("ElevenLabs anahtarı tanımlı değil. .env dosyasına ELEVENLABS_API_KEY ekleyin.");
  }
  const agentId = process.env.ELEVENLABS_AGENT_ID?.trim() || DEFAULT_AGENT_ID;
  const url = `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`;
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
  if (status !== 200 || !signedUrl.startsWith("wss://")) {
    throw new Error("Ses oturumu açılamadı.");
  }
  return signedUrl;
}
