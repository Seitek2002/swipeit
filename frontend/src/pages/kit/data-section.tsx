"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useFeedPage } from "@/entities/product";
import { useFriends, useLoginDemo, useMe, useUpdateMe } from "@/entities/user";

import { EMPTY_FILTERS, resetDemo, updateDemoSettings } from "@/shared/api";
import { clock } from "@/shared/lib/clock";
import { formatPrice } from "@/shared/lib/format";
import { useDemoSettingsStore } from "@/shared/store";
import { Avatar, Button, Spinner, toast } from "@/shared/ui";

// Проверка слоя данных (T04): текущий пользователь, друзья и первая порция
// ленты — всё через transport и мок-сервер, а не напрямую из localStorage.
export const DataSection = () => {
  const queryClient = useQueryClient();
  const me = useMe();
  const friends = useFriends();
  const feed = useFeedPage(EMPTY_FILTERS);
  const loginDemo = useLoginDemo();
  const updateMe = useUpdateMe();
  // Перемотка часов демо — временно здесь, пока нет демо-панели (T12).
  const offset = useDemoSettingsStore((state) => state.settings.clockOffsetMs);
  const shiftClock = (deltaMs: number) =>
    updateDemoSettings({ clockOffsetMs: deltaMs === 0 ? 0 : offset + deltaMs })
      .then(() => queryClient.invalidateQueries())
      .then(() =>
        toast(`Часы демо: ${new Date(clock.now()).toLocaleDateString("ru")}`, {
          tone: "info",
        }),
      );
  const reset = useMutation({
    mutationFn: resetDemo,
    onSuccess: () => {
      void queryClient.invalidateQueries();
      toast("Демо-данные сброшены");
    },
    onError: () => toast("Не получилось сбросить", { tone: "error" }),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        <Button
          variant="secondary"
          loading={loginDemo.isPending}
          onClick={() => loginDemo.mutate()}
        >
          Войти как демо
        </Button>
        <Button
          variant="secondary"
          loading={reset.isPending}
          onClick={() => reset.mutate()}
        >
          Сбросить демо
        </Button>
        <Button
          variant="secondary"
          disabled={!me.data}
          loading={updateMe.isPending}
          onClick={() =>
            me.data &&
            updateMe.mutate({
              name: (me.data.name ?? "").endsWith(" 2")
                ? (me.data.name ?? "").slice(0, -2)
                : `${me.data.name ?? ""} 2`,
            })
          }
        >
          Сменить имя
        </Button>
        <Button variant="secondary" onClick={() => void shiftClock(86_400_000)}>
          Перемотать на 1 день
        </Button>
        {offset !== 0 && (
          <Button variant="ghost" onClick={() => void shiftClock(0)}>
            Вернуть часы
          </Button>
        )}
      </div>

      <div data-testid="me" className="text-body">
        {me.isLoading && <Spinner />}
        {me.data ? (
          <span className="flex items-center gap-3">
            <Avatar name={me.data.name ?? ""} color={me.data.avatarColor} />
            Текущий пользователь: {me.data.name || "без имени"}
          </span>
        ) : (
          !me.isLoading && (
            <span className="text-rose">
              {me.error ? me.error.message : "Никто не вошёл"}
            </span>
          )
        )}
      </div>

      {friends.data && (
        <ul data-testid="friends" className="text-body flex flex-col gap-1">
          {friends.data.map(({ user, daysToBirthday }) => (
            <li key={user.id} className="flex items-center gap-2">
              <Avatar name={user.name} color={user.avatarColor} size={28} />
              {user.name}
              <span className="text-caption text-rose">
                {daysToBirthday === null
                  ? "без даты"
                  : `ДР через ${daysToBirthday} дн.`}
              </span>
            </li>
          ))}
        </ul>
      )}

      {feed.data && (
        <ol data-testid="feed" className="text-body flex flex-col gap-1">
          {feed.data.items.map((product) => (
            <li key={product.id} className="flex justify-between gap-3">
              <span className="truncate">{product.title}</span>
              <span className="text-price shrink-0 text-[15px]">
                {formatPrice(product.priceMin, product.priceMax)}
              </span>
            </li>
          ))}
          <li className="text-caption text-rose">
            Всего в ленте: {feed.data.total}
          </li>
        </ol>
      )}
    </div>
  );
};
