"use client";

import type { ReactNode } from "react";

import {
  ExternalLink,
  Palette,
  Quote,
  Ruler,
  ShoppingBag,
  Sparkles,
  Tag,
} from "lucide-react";

import {
  type Product,
  type VariantGroup,
  describeVariant,
  storeLabel,
} from "@/entities/product";

import { INTEREST_LABELS } from "@/shared/config";
import { formatPrice } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { Chip } from "@/shared/ui";

const MONTHS = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

const checkedLabel = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
};

// Первый вариант каждой группы — выбор по умолчанию.
export const defaultChoice = (groups: VariantGroup[] = []) =>
  Object.fromEntries(
    groups.flatMap((group) =>
      group.options[0] ? [[group.id, group.options[0].id]] : [],
    ),
  );

const GROUP_ICONS: Record<VariantGroup["kind"], typeof Palette> = {
  color: Palette,
  size: Ruler,
  other: Tag,
};

type Tone = "card" | "sheet";

// Секция подробностей (как Section в tap-tap): на карточке — бархат-2 на
// бархате, в шторке (она сама бархат-2) — бархат, чтобы чипы читались.
const Section = ({
  icon,
  title,
  tone,
  children,
}: {
  children: ReactNode;
  icon: ReactNode;
  title: string;
  tone: Tone;
}) => {
  const Heading = tone === "card" ? "h2" : "h3";
  return (
    <section
      className={cn(
        "rounded-2xl p-4",
        tone === "card" ? "bg-velvet-2" : "bg-velvet",
      )}
    >
      {/* На карточке выше только h1 экрана — секции h2; в шторке под её h2
        с названием подарка — h3 (axe heading-order). */}
      <Heading className="text-caption text-rose flex items-center gap-1.5 font-semibold">
        {icon}
        {title}
      </Heading>
      <div className="text-body text-paper mt-2">{children}</div>
    </section>
  );
};

type Props = {
  choice: Record<string, string>;
  hidePrices?: boolean;
  onChoose: (group: VariantGroup, optionId: string) => void;
  // Колода ссылки-фильтра (/pick/): выбирает друг для отправителя, своего
  // вишлиста у него тут нет — подпись «Выбрано: чёрный» без «Друзья увидят…»
  // (auto-tasks V05).
  pickMode?: boolean;
  product: Product;
  // Чужой выбор — только посмотреть (гость, ответ друга; auto-tasks U03):
  // чипы не нажимаются, подпись «{readOnlyCaption}: Белый» без «Друзья
  // увидят…», которое обращено к владельцу.
  readOnlyCaption?: string;
  tone?: Tone;
};

// Подробности подарка (DESIGN.md §7 GiftCard): описание, варианты, где купить,
// интересы. Общие для фото-карточки в колоде и шторки «Подробнее» (§8.2).
// Без цен (выбор друга с hidePrices) — цен нет и в «Где купить».
export const ProductDetailsSections = ({
  product,
  choice,
  onChoose,
  hidePrices = false,
  pickMode = false,
  readOnlyCaption,
  tone = "card",
}: Props) => {
  const readOnly = readOnlyCaption !== undefined;
  // Названия как в каталоге («Chroma Indigo»), без строчных — для подписи
  // чужого выбора.
  const chosenLabels = (product.variants ?? [])
    .map(
      (group) =>
        group.options.find((option) => option.id === choice[group.id])?.label,
    )
    .filter(Boolean)
    .join(", ");
  const paragraphs = product.description.split(/\n{2,}/).filter(Boolean);
  const groups = product.variants ?? [];
  const chosen = describeVariant(product, choice);
  const interests = product.interests.flatMap((id) => {
    const label = (INTEREST_LABELS as Record<string, string | undefined>)[id];
    return label ? [label] : [];
  });
  const latestCheck = product.offers
    .map((offer) => offer.checkedAt)
    .sort()
    .at(-1);

  return (
    <div className="flex flex-col gap-3">
      {paragraphs.length > 0 && (
        <Section
          tone={tone}
          title="Описание"
          icon={<Quote aria-hidden size={16} strokeWidth={2} />}
        >
          <div className="flex flex-col gap-2">
            {paragraphs.map((paragraph) => (
              <p key={paragraph.slice(0, 32)}>{paragraph}</p>
            ))}
          </div>
        </Section>
      )}

      {groups.map((group, position) => {
        const Icon = GROUP_ICONS[group.kind];
        return (
          <Section
            key={group.id}
            tone={tone}
            title={group.label}
            icon={<Icon aria-hidden size={16} strokeWidth={2} />}
          >
            <div
              role="group"
              aria-label={group.label}
              className="flex flex-wrap gap-2"
            >
              {group.options.map((option) => (
                <Chip
                  key={option.id}
                  selected={choice[group.id] === option.id}
                  disabled={readOnly && choice[group.id] !== option.id}
                  aria-disabled={readOnly || undefined}
                  onClick={() => !readOnly && onChoose(group, option.id)}
                  icon={
                    option.hex ? (
                      <i
                        aria-hidden
                        className="size-3.5 flex-none rounded-full shadow-[0_0_0_1px_rgb(255_241_243/0.5)]"
                        style={{ background: option.hex }}
                      />
                    ) : undefined
                  }
                >
                  {option.label}
                </Chip>
              ))}
            </div>
            {position === groups.length - 1 &&
              (readOnly
                ? chosenLabels && (
                    <p className="text-caption text-rose mt-2.5">
                      {readOnlyCaption}: {chosenLabels}
                    </p>
                  )
                : chosen && (
                    <p className="text-caption text-rose mt-2.5">
                      {pickMode
                        ? `Выбрано: ${chosen}`
                        : `Мне подойдёт: ${chosen}. Друзья увидят это в вишлисте.`}
                    </p>
                  ))}
          </Section>
        );
      })}

      <Section
        tone={tone}
        title="Где купить"
        icon={<ShoppingBag aria-hidden size={16} strokeWidth={2} />}
      >
        {hidePrices ? (
          // Цены скрыли — магазины тоже (auto-tasks P13): по ссылке в
          // магазин цена видна сразу. Друг здесь только выбирает, покупает
          // тот, кто прислал ссылку.
          <p className="text-body text-rose">
            Цены и магазины скрыты — подарок купит тот, кто прислал ссылку.
          </p>
        ) : (
          <>
            <ul>
              {product.offers.map((offer) => (
                <li
                  key={offer.url}
                  className="border-line flex items-center justify-between gap-3 py-1 [&+&]:mt-2 [&+&]:border-t [&+&]:pt-3"
                >
                  <div className="min-w-0">
                    <b className="block truncate font-semibold">
                      {storeLabel(offer)}
                    </b>
                    {!hidePrices && (
                      <span className="text-price block">
                        {formatPrice(offer.price)}
                      </span>
                    )}
                  </div>
                  <a
                    href={offer.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Открыть в магазине ${storeLabel(offer)}`}
                    className="text-mandarin flex min-h-11 flex-none items-center gap-1 text-[15px] font-semibold"
                  >
                    Открыть
                    <ExternalLink aria-hidden size={16} strokeWidth={2} />
                  </a>
                </li>
              ))}
            </ul>
            {!hidePrices && latestCheck && (
              <p className="text-caption text-rose mt-2">
                Цены примерные, обновлены {checkedLabel(latestCheck)}
              </p>
            )}
          </>
        )}
      </Section>

      {interests.length > 0 && (
        <Section
          tone={tone}
          title="Подойдёт, если любишь"
          icon={<Sparkles aria-hidden size={16} strokeWidth={2} />}
        >
          <ul className="flex flex-wrap gap-2">
            {interests.map((label) => (
              <li
                key={label}
                className="bg-velvet-3 rounded-chip flex h-8 items-center px-3 text-[13px] font-medium"
              >
                {label}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
};
