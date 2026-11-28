"use client";

import { type CSSProperties, useState } from "react";

import { Clock, MapPin } from "lucide-react";

import { ACTIVITY_TAG_LABELS } from "@/shared/config";
import { withBasePath } from "@/shared/lib/base-path";
import { useCustomImageUrl } from "@/shared/lib/dom";
import { useImageStatus } from "@/shared/lib/image-cache";
import { cn } from "@/shared/lib/utils";
import { StoreTag } from "@/shared/ui";

import {
  type Activity,
  CATEGORY_ICONS,
  formatDuration,
  formatPerPerson,
} from "../model";

type Props = {
  activity: Activity;
  className?: string;
  // В колоде билет растягивается на высоту стола, в списках — по контенту.
  fill?: boolean;
  // Описание целиком (экран «Решено»); иначе — до 3 строк (UX-аудит W06).
  fullDescription?: boolean;
};

// Перфорация (DESIGN.md §7, reference .ticket): полукруглые вырезы по бокам
// на линии отрыва — сразу под фото 16:10. Высота фото считается от ширины
// билета (контейнерные единицы), поэтому вырез всегда на пунктире.
const TICKET_STYLE = {
  "--ph": "calc((100cqw - 20px) * 0.625)",
  "--perf": "calc(19px + var(--ph))",
  mask: "radial-gradient(circle 11px at 0 var(--perf), #0000 96%, #000 100%) 0 0 / 51% 100% no-repeat, radial-gradient(circle 11px at 100% var(--perf), #0000 96%, #000 100%) 100% 0 / 51% 100% no-repeat",
} as CSSProperties;

const Photo = ({ activity }: { activity: Activity }) => {
  const customUrl = useCustomImageUrl(activity.imageKey);
  const src = activity.image
    ? withBasePath(activity.image.src)
    : (customUrl ?? undefined);
  // Фото уже в кеше колоды (ActivityDeck грузит два следующих заранее) — сразу;
  // иначе перелив, пока <img> не загрузится (UX-аудит M4: раньше — пустая
  // розовая заливка). Без банта: билетик маленький. Не загрузилось — вид
  // «без фото» ниже.
  const cached = useImageStatus(src) === "ready";
  const [loadedSrc, setLoadedSrc] = useState<null | string>(null);
  const [failedSrc, setFailedSrc] = useState<null | string>(null);
  const loaded = cached || (src !== undefined && loadedSrc === src);
  if (src && failedSrc !== src) {
    return (
      <>
        {!loaded && (
          <div aria-hidden className="skeleton bg-paper-2 absolute inset-0" />
        )}
        <img
          src={src}
          alt={activity.image?.alt ?? ""}
          draggable={false}
          // В колоде на столе не больше трёх билетов — все грузим сразу (§10).
          loading="eager"
          onLoad={() => setLoadedSrc(src)}
          onError={() => setFailedSrc(src)}
          className={cn(
            "absolute inset-0 size-full object-cover select-none",
            !loaded && "opacity-0",
          )}
        />
      </>
    );
  }
  // Своё занятие без фото: бумага-2, крупная иконка категории и название
  // курсивом Cormorant (DESIGN.md §7).
  const Icon = CATEGORY_ICONS[activity.category];
  return (
    <div className="flex size-full flex-col items-center justify-center gap-2 px-6 text-center">
      <Icon aria-hidden size={44} strokeWidth={1.5} className="text-ink-soft" />
      <p className="font-display text-ink line-clamp-2 text-[22px] leading-[26px] italic">
        {activity.title}
      </p>
    </div>
  );
};

// Билетик занятия (DESIGN.md §7 ActivityTicket): фото, линия отрыва,
// название, цена на человека, длительность и место, метки.
export const ActivityTicket = ({
  activity,
  className,
  fill = false,
  fullDescription = false,
}: Props) => {
  const duration = formatDuration(activity.durationMin, activity.durationMax);
  const where = activity.distanceNote ?? activity.place;
  const tags = activity.tags.slice(0, 3);

  return (
    <div className={cn("@container", fill && "h-full", className)}>
      <article
        style={TICKET_STYLE}
        className={cn(
          "paper rounded-paper flex flex-col p-2.5 shadow-[0_1px_0_rgb(255_255_255/0.6)_inset]",
          fill && "h-full",
        )}
      >
        <div className="bg-paper-2 relative h-(--ph) flex-none overflow-hidden rounded-2xl">
          <Photo activity={activity} />
        </div>
        <div
          aria-hidden
          className="relative h-[18px] flex-none before:absolute before:inset-x-[18px] before:top-1/2 before:border-t-2 before:border-dashed before:border-[rgb(122_90_110/0.4)] before:content-['']"
        />
        <div className="flex min-h-0 flex-1 flex-col px-1.5 pt-1">
          <h3 className="text-title-2 line-clamp-2 flex-none">
            {activity.title}
          </h3>
          <p className="text-price mt-1.5 flex-none">
            {formatPerPerson(activity)}
            {activity.pricePerPersonMax > 0 && (
              <span className="text-ink-soft text-[15px] font-medium">
                {" "}
                / чел.
              </span>
            )}
          </p>
          {(duration || where) && (
            <p className="text-ink-soft mt-2 flex flex-none flex-wrap items-center gap-x-2 gap-y-1 text-[13px] leading-[18px] font-medium">
              {duration && (
                <span className="inline-flex items-center gap-1.5">
                  <Clock aria-hidden size={16} strokeWidth={1.75} />
                  {duration}
                </span>
              )}
              {where && (
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <MapPin
                    aria-hidden
                    size={16}
                    strokeWidth={1.75}
                    className="flex-none"
                  />
                  <span className="truncate">{where}</span>
                </span>
              )}
            </p>
          )}
          {/* Описание — между временем и метками (W06): по одному фото
              «Ужин с видом на город» не понять, что это. В колоде до 3
              строк и сжимается первым — метки не уезжают за край. */}
          {activity.description && (
            <p
              className={cn(
                "text-ink-soft mt-2 text-[14px] leading-5",
                // Низкий экран (360×640) — одна строка: иначе вторая обрезается
                // посередине.
                !fullDescription &&
                  "line-clamp-3 min-h-0 overflow-hidden [@media(max-height:700px)]:line-clamp-1",
              )}
            >
              {activity.description}
            </p>
          )}
          {tags.length > 0 && (
            <div className="mt-auto flex flex-none flex-wrap gap-1.5 pt-2.5">
              {tags.map((tag) => (
                <StoreTag key={tag}>{ACTIVITY_TAG_LABELS[tag]}</StoreTag>
              ))}
            </div>
          )}
        </div>
      </article>
    </div>
  );
};
