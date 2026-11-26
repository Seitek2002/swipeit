import { getTransport } from "../transport";
import type { FriendSummary, NewUserInput, UpdateMeInput, User } from "./types";

export const loginDemoFn = (): Promise<User> =>
  getTransport().request<User>("POST", "/auth/demo");

export const createUser = (input: NewUserInput): Promise<User> =>
  getTransport().request<User>("POST", "/users", input);

export const getMe = (): Promise<User> =>
  getTransport().request<User>("GET", "/me");

export const updateMe = (patch: UpdateMeInput): Promise<User> =>
  getTransport().request<User>("PATCH", "/me", patch);

export const getUser = (id: string): Promise<User> =>
  getTransport().request<User>("GET", `/users/${encodeURIComponent(id)}`);

export const getFriends = (): Promise<FriendSummary[]> =>
  getTransport().request<FriendSummary[]>("GET", "/friends");
