import type { SavedCreation } from "../../shared/contracts";

async function request(
  path: string,
  init: RequestInit = {},
  timeout = 20_000,
): Promise<Response> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok) {
    let code = `STORAGE_HTTP_${response.status}`;
    try {
      const body: unknown = await response.json();
      if (
        body &&
        typeof body === "object" &&
        "error" in body &&
        typeof body.error === "string"
      )
        code = body.error;
    } catch {
      /* Preserve HTTP failure when the server did not send JSON. */
    }
    throw new Error(code);
  }
  return response;
}

export async function saveCreation(
  meta: Omit<SavedCreation, "imageUrl" | "hasVideo">,
  image: Blob,
  video: Blob | null,
  cover?: Blob | null,
): Promise<void> {
  if (!image.size) throw new Error("STORAGE_EMPTY_IMAGE");
  const form = new FormData();
  form.append("meta", JSON.stringify(meta));
  form.append("image", image, "image");
  if (video?.size) form.append("video", video, "video");
  if (cover?.size) form.append("cover", cover, "cover.jpg");
  await request("/api/creations", { method: "POST", body: form }, 120_000);
}

function isCreation(value: unknown): value is SavedCreation {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.dishId === "string" &&
    typeof row.title === "string" &&
    typeof row.description === "string" &&
    Array.isArray(row.ingredients) &&
    row.ingredients.every((item) => typeof item === "string") &&
    (row.animals === undefined ||
      (Array.isArray(row.animals) &&
        row.animals.every((item) => typeof item === "string"))) &&
    typeof row.createdAt === "number" &&
    typeof row.imageUrl === "string" &&
    typeof row.hasVideo === "boolean"
  );
}

export async function listCreations(): Promise<SavedCreation[]> {
  const body: unknown = await (await request("/api/creations")).json();
  if (!Array.isArray(body) || !body.every(isCreation))
    throw new Error("STORAGE_INVALID_RESPONSE");
  return body;
}

async function media(
  id: string,
  kind: "image" | "video",
): Promise<Blob | null> {
  const response = await fetch(
    `/api/creations/${encodeURIComponent(id)}/${kind}`,
    {
      credentials: "same-origin",
      signal: AbortSignal.timeout(60_000),
    },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`STORAGE_HTTP_${response.status}`);
  const blob = await response.blob();
  return blob.size ? blob : null;
}

export const getVideo = (id: string): Promise<Blob | null> =>
  media(id, "video");
export const getImage = (id: string): Promise<Blob | null> =>
  media(id, "image");
