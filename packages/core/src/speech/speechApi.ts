interface IApiConfig {
  baseUrl: string;
  token: string;
}

const errorFrom = async (res: Response, fallback: string): Promise<Error> => {
  const body = (await res.json().catch(() => null)) as {
    error?: string;
  } | null;

  return new Error(body?.error ?? `${fallback} (${res.status})`);
};

export async function requestSpeechAudio(
  config: IApiConfig,
  text: string,
  signal: AbortSignal,
): Promise<ArrayBuffer> {
  const res = await fetch(`${config.baseUrl}/tts/speech`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
    signal,
  });
  if (!res.ok) throw await errorFrom(res, "Speech failed");

  return res.arrayBuffer();
}

export async function uploadSpeechReference(
  config: IApiConfig,
  audio: Blob,
  text: string,
): Promise<void> {
  const form = new FormData();
  form.append("file", audio, "reference.wav");
  form.append("text", text);
  const res = await fetch(`${config.baseUrl}/tts/reference`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.token}` },
    body: form,
  });
  if (!res.ok) throw await errorFrom(res, "Could not save the reference");
}
