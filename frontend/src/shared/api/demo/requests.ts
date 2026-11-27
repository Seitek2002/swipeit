import { getTransport } from "../transport";
import type { User } from "../users/types";
import type { DemoSettings } from "./types";

export const resetDemo = (): Promise<{ ok: true }> =>
  getTransport().request<{ ok: true }>("POST", "/demo/reset");

export const getDemoSettings = (): Promise<DemoSettings> =>
  getTransport().request<DemoSettings>("GET", "/demo/settings");

export const updateDemoSettings = (
  patch: Partial<DemoSettings>,
): Promise<DemoSettings> =>
  getTransport().request<DemoSettings>("PATCH", "/demo/settings", patch);

export const getDemoUsers = (): Promise<User[]> =>
  getTransport().request<User[]>("GET", "/demo/users");
