"use client";

import Link from "next/link";

import { ChevronRight, Gift } from "lucide-react";

import { useOpenedWishlists } from "@/entities/wishlist";

import { clock } from "@/shared/lib/clock";
import { occasionLabel } from "@/shared/lib/format";
import { Avatar } from "@/shared/ui";

import { openedCaption } from "./model";

// «Открывал по ссылке» на «Друзьях» (UX-аудит X03): гость, собравший свой
// вишлист, находит вишлист друга здесь, а не в чате. Отдельно от списка
// друзей: человек по ссылке и демо-друг с тем же именем — разные люди.
// Пусто — раздела нет.
export const OpenedWishlists = () => {
  const { data } = useOpenedWishlists();
  const list = data ?? [];
  if (list.length === 0) return null;
  const now = clock.now();

  return (
    <section className="mt-5 px-5" aria-labelledby="opened-wishlists-title">
      <h2 id="opened-wishlists-title" className="text-label">
        Открывал по ссылке
      </h2>
      <ul className="mt-1">
        {list.map((opened) => (
          <li key={opened.id}>
            {/* Путь снимка даёт сервер («/w/?d=…» в демо) — не из ROUTES. */}
            <Link
              href={opened.url}
              className="border-line flex min-h-[68px] items-center gap-3.5 border-b py-2.5"
            >
              <Avatar
                name={opened.owner.name}
                color={opened.owner.avatarColor}
                size={44}
                decorative
              />
              <span className="min-w-0 flex-1">
                <span className="text-body text-paper block font-semibold">
                  {opened.owner.name}
                </span>
                <span className="text-caption text-rose block">
                  {openedCaption(occasionLabel(opened.occasion, now))}
                </span>
                <span className="text-caption text-paper mt-0.5 flex items-center gap-1 font-semibold">
                  <Gift aria-hidden size={14} strokeWidth={1.75} />
                  Посмотреть вишлист
                </span>
              </span>
              <ChevronRight
                aria-hidden
                size={20}
                strokeWidth={1.75}
                className="text-rose flex-none"
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
};
