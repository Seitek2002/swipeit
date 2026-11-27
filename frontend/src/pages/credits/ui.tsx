"use client";

import { useEffect } from "react";

import { useQuery } from "@tanstack/react-query";

import { AppHeader } from "@/widgets/app-header";

import {
  type Activity,
  type PhotoCredit,
  activityKeys,
  catalogKeys,
  getActivities,
  getCatalogMeta,
} from "@/shared/api";
import { useAppReady } from "@/shared/lib/app-status";
import { withBasePath } from "@/shared/lib/base-path";
import { Button, EmptyState, Screen, ScreenBody, Skeleton } from "@/shared/ui";

type Row = { activity: Activity; credit: PhotoCredit };

// Строка автора (DESIGN.md §8.9): миниатюра 56×36, название, автор и
// лицензия. Тап по строке — страница файла, лицензия — отдельная ссылка.
const CreditRow = ({ row }: { row: Row }) => {
  const { activity, credit } = row;
  return (
    <li className="border-line relative flex items-center gap-3 border-b py-3">
      <img
        src={withBasePath(activity.image?.src ?? "")}
        alt=""
        // Миниатюра 56×36, а файл — полноразмерное фото занятия (1280×800,
        // ~200 КБ): строк ~45, и сразу все они весили бы ~7 МБ. Грузим только
        // те, до которых долистали; размеры — чтобы строка не прыгала.
        width={56}
        height={36}
        loading="lazy"
        decoding="async"
        className="h-9 w-14 flex-none rounded-lg object-cover"
      />
      <div className="min-w-0 flex-1">
        <a
          href={credit.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-body text-paper flex min-h-11 items-center before:absolute before:inset-0 before:content-['']"
        >
          {/* Многоточие — у вложенного блока: у flex-контейнера text-overflow
              не срабатывает, длинное название просто срезалось бы. */}
          <span className="min-w-0 truncate">{activity.title}</span>
        </a>
        {/* Обрезается только автор: лицензию показывать обязательно (CC BY),
            поэтому она не сжимается и всегда видна целиком. */}
        <p className="text-caption text-rose flex min-w-0 items-center gap-1 whitespace-nowrap">
          <span className="min-w-0 truncate">{credit.author}</span>
          <span aria-hidden className="flex-none">
            —
          </span>
          {credit.licenseUrl ? (
            <a
              href={credit.licenseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="relative z-[1] flex-none underline underline-offset-2 before:absolute before:-inset-x-1 before:-inset-y-[13px] before:content-['']"
            >
              {credit.license}
            </a>
          ) : (
            <span className="flex-none">{credit.license}</span>
          )}
        </p>
      </div>
    </li>
  );
};

// «Авторы фото» (DESIGN.md §8.9, TECH_SPEC CatalogMeta): фото занятий — с
// Wikimedia Commons под CC BY и CC BY-SA, без указания авторов их
// показывать нельзя. Без таб-бара и без анимаций.
export const CreditsPage = () => {
  // Экран рисуется до запуска вкладки — текст есть уже в статическом HTML
  // (shared/config rendersBeforeReady). Список — через API, а транспорт
  // (мок или ноутбук) выбран только после запуска: до него ждём.
  const ready = useAppReady();
  const meta = useQuery({
    queryKey: catalogKeys.meta(),
    queryFn: getCatalogMeta,
    staleTime: Infinity,
    enabled: ready,
  });
  const activities = useQuery({
    queryKey: activityKeys.list(),
    queryFn: () => getActivities(),
    staleTime: Infinity,
    enabled: ready,
  });

  const credits = new Map(
    (meta.data?.activityPhotoCredits ?? []).map((credit) => [
      credit.activityId,
      credit,
    ]),
  );
  const withPhoto = (activities.data ?? []).filter(
    (activity) => activity.image,
  );
  const rows: Row[] = withPhoto.flatMap((activity) => {
    const credit = credits.get(activity.id);
    return credit ? [{ activity, credit }] : [];
  });
  const missingIds = meta.data
    ? withPhoto
        .filter((activity) => !credits.has(activity.id))
        .map((activity) => activity.id)
        .join(", ")
    : "";

  // Фото без записи в meta.json — нарушение лицензии: в dev-сборке громко.
  useEffect(() => {
    if (process.env.NODE_ENV === "production" || !missingIds) return;
    console.warn(`Нет автора в meta.json для фото занятий: ${missingIds}`);
  }, [missingIds]);

  const failed = meta.isError || activities.isError;

  return (
    <Screen>
      <AppHeader title="Авторы фото" showBack showAvatar={false} />
      <ScreenBody className="px-5 pt-2 pb-6">
        <p className="text-body text-rose">
          Фото занятий — с Wikimedia Commons. Мы обрезали и сжали их для
          приложения. Фото подарков взяты из карточек магазинов, ссылка на
          магазин есть в каждом подарке.
        </p>
        {failed ? (
          <EmptyState
            className="mt-10"
            title="Не получилось загрузить список. Проверь связь и попробуй ещё раз."
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  void meta.refetch();
                  void activities.refetch();
                }}
              >
                Попробовать ещё раз
              </Button>
            }
          />
        ) : !meta.data || !activities.data ? (
          <div className="mt-4 flex flex-col gap-3">
            {[0, 1, 2, 3, 4].map((index) => (
              <Skeleton key={index} className="h-12" />
            ))}
          </div>
        ) : (
          <ul className="mt-4">
            {rows.map((row) => (
              <CreditRow key={row.activity.id} row={row} />
            ))}
          </ul>
        )}
      </ScreenBody>
    </Screen>
  );
};
