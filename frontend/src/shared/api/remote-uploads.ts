import { getRemoteToken, markRemoteSessionExpired } from "@/shared/store";

import { CLIENT_BUILD } from "./client-build";
import { ApiError } from "./mock-server/errors";
import { getRemoteApiBase, remoteApiUrl } from "./remote-base";
import { remoteErrorFromResponse } from "./remote-errors";

// Фото своих желаний в режиме remote (BACKEND.md B13, §9.3): картинка — в
// теле POST /v1/uploads как есть (не JSON), поэтому мимо remoteTransport.
// Ответ — { key, url }; в желание кладём только ключ, адрес строит urlOf.
const baseOrThrow = () => {
  const base = getRemoteApiBase();
  if (!base) throw new Error("remote-uploads без NEXT_PUBLIC_API_URL");
  return base;
};

export const uploadRemoteImage = async (blob: Blob): Promise<string> => {
  const headers: Record<string, string> = {
    "content-type": blob.type || "image/jpeg",
    "x-client-build": CLIENT_BUILD,
  };
  const token = getRemoteToken();
  if (token) headers.authorization = `Bearer ${token}`;
  let response: Response;
  try {
    response = await fetch(remoteApiUrl(baseOrThrow(), "/uploads"), {
      method: "POST",
      headers,
      body: blob,
    });
  } catch {
    throw new ApiError(0, "OFFLINE", "Нет связи с сервером. Проверь интернет");
  }
  const data = (await response.json().catch(() => null)) as {
    key?: unknown;
  } | null;
  if (!response.ok) {
    const error = remoteErrorFromResponse(response.status, data);
    if (error.code === "UNAUTHORIZED" && token) markRemoteSessionExpired();
    throw error;
  }
  if (typeof data?.key !== "string") {
    throw new ApiError(
      response.status,
      "VALIDATION",
      "Не получилось загрузить фото",
    );
  }
  return data.key;
};

// GET /v1/uploads/:key открыт всем: фото своего желания видят гости ссылки.
export const remoteImageUrl = (key: string) =>
  remoteApiUrl(baseOrThrow(), `/uploads/${encodeURIComponent(key)}`);
