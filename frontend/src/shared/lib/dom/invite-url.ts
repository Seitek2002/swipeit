import { useEffect } from "react";

import { useRouter } from "next/navigation";

import { useQuery } from "@tanstack/react-query";

import {
  type ApiMode,
  type InviteKind,
  type InviteLink,
  type ShareTarget,
  createInviteLink,
  getMode,
  getShareTarget,
  inviteKeys,
  isApiError,
} from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { useAppMode } from "@/shared/lib/app-status";

import { absoluteUrl } from "./share-targets";

export type { InviteKind };

// Экран приглашения по виду: в local и lan ссылка ведёт прямо на него.
export const joinPath = (kind: InviteKind, id: string) =>
  kind === "plan" ? ROUTES.PLAN_JOIN(id) : ROUTES.SANTA_JOIN(id);

// Куда вести по коду из ?s= (GET /share/:code). null — код не про план и не
// про игру (вишлист, ссылка-фильтр): для приглашения это «ссылки нет».
export const shareTargetPath = (target: ShareTarget): null | string => {
  if (target.kind === "plan") return ROUTES.PLAN_JOIN(target.planId);
  if (target.kind === "santa") return ROUTES.SANTA_JOIN(target.gameId);
  return null;
};

type Deps = {
  absolute: (path: string) => string;
  createLink: (kind: InviteKind, id: string) => Promise<InviteLink>;
  mode: () => ApiMode;
};

// Одна функция для всех ссылок-приглашений (auto-tasks-pm-3 R07): лобби,
// конец колоды, «Решено», экран игры, «Сообщить в чат», «Напомнить». В local
// и lan — адрес экрана, как раньше (localPath — свой экран места вызова). В
// remote — короткая ссылка сервера «…/s/<код>» (BACKEND.md §6.2): по ней
// мессенджер покажет превью, а сервер переведёт на экран приглашения.
//
// Ссылка на цель у сервера одна и живая, поэтому её помним до конца вкладки:
// повторное «Скопировать» не ходит в сеть. Не получилось — забываем, и
// следующее нажатие спросит снова.
export const createInviteUrl = ({ absolute, createLink, mode }: Deps) => {
  const cache = new Map<string, Promise<string>>();
  return (
    kind: InviteKind,
    id: string,
    localPath: string = joinPath(kind, id),
  ): Promise<string> => {
    if (mode() !== "remote") return Promise.resolve(absolute(localPath));
    const key = `${kind}:${id}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const url = createLink(kind, id).then((link) => absolute(link.url));
    cache.set(key, url);
    url.catch(() => cache.delete(key));
    return url;
  };
};

export const inviteUrl = createInviteUrl({
  absolute: absoluteUrl,
  createLink: createInviteLink,
  mode: getMode,
});

// Взять короткую ссылку заранее, пока человек смотрит на экран. Иначе
// «Скопировать» ждало бы ответа сервера, а Safari пускает в буфер обмена
// только сразу после нажатия. Ошибка тут не важна: нажатие спросит снова и
// покажет её.
export const usePrefetchInvite = (
  kind: InviteKind,
  id: string,
  enabled = true,
) => {
  useEffect(() => {
    if (!enabled || getMode() !== "remote") return;
    inviteUrl(kind, id).catch(() => undefined);
  }, [kind, id, enabled]);
};

export type InviteCodeState = {
  // Сбой связи — «Попробовать ещё раз».
  failed: boolean;
  // Ссылки нет, она закрыта или ведёт не на план и не на игру. В local и
  // lan коротких ссылок нет вовсе — тоже «нет».
  missing: boolean;
  retry: () => void;
};

// Экран приглашения открыт по коду ?s= (короткая ссылка remote, §6.2): код →
// GET /share/:code → тот же экран с ?id=. Пустой code — ничего не делает.
export const useInviteCode = (code: string): InviteCodeState => {
  const router = useRouter();
  const mode = useAppMode();
  const remote = mode === "remote";
  const query = useQuery({
    queryKey: inviteKeys.code(code),
    queryFn: () => getShareTarget(code),
    enabled: remote && Boolean(code),
    // Цель ссылки не меняется: второй раз сервер не спрашиваем.
    staleTime: Infinity,
  });
  const path = query.data ? shareTargetPath(query.data) : null;
  useEffect(() => {
    if (path) router.replace(path);
  }, [path, router]);
  const missing =
    Boolean(code) &&
    ((mode !== null && !remote) ||
      (query.data !== undefined && path === null) ||
      (isApiError(query.error) && query.error.code === "NOT_FOUND"));
  return {
    missing,
    failed: query.isError && !missing,
    retry: () => void query.refetch(),
  };
};
