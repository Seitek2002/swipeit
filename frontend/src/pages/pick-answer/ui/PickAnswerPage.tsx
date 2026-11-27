"use client";

import { Suspense, useState } from "react";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Star } from "lucide-react";

import { ProductDetailsSheet } from "@/features/product-details";
import { describeFilters } from "@/features/product-filters";

import {
  type Product,
  describeVariant,
  imageForChoice,
  storeLabel,
  useProduct,
} from "@/entities/product";

import {
  type PickAnswer,
  importPickAnswer,
  isApiError,
  pickKeys,
} from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { withBasePath } from "@/shared/lib/base-path";
import { formatPrice, occasionLabel, pluralize } from "@/shared/lib/format";
import { decodePickAnswer } from "@/shared/lib/share-codec";
import {
  Avatar,
  Brand,
  BrokenLink,
  Button,
  ContentSkeleton,
  EmptyState,
  Screen,
  ScreenBody,
  Skeleton,
  buttonClassName,
} from "@/shared/ui";

type Pick = PickAnswer["picks"][number];

// «Айгерим выбрала 5 подарков»: род — по полю из ссылки; без него —
// нейтрально.
const headline = (answer: PickAnswer) => {
  const gifts = pluralize(answer.picks.length, [
    "подарок",
    "подарка",
    "подарков",
  ]);
  const { gender, name } = answer.by;
  if (gender === "female") return `${name} выбрала ${gifts}`;
  if (gender === "male") return `${name} выбрал ${gifts}`;
  return `${name}: выбрано ${gifts}`;
};

// Карточка выбора — как у гостя вишлиста (DESIGN.md §8.5), но вместо брони
// офферы: магазин, цена и «Открыть».
const PickCard = ({
  pick,
  onOpen,
}: {
  onOpen: (product: Product, choice?: Record<string, string>) => void;
  pick: Pick;
}) => {
  const { data: product, isError } = useProduct(pick.productId);
  if (isError) return null;
  if (!product) {
    return <Skeleton tone="paper" className="h-80 rounded-[22px]" />;
  }
  const image = imageForChoice(product, pick.variantChoice);
  const variant = describeVariant(product, pick.variantChoice);
  return (
    <li className="drop-shadow-[0_16px_18px_rgb(10_0_8/0.4)]">
      <article className="paper rounded-paper px-3 pt-3 pb-2">
        <button
          type="button"
          onClick={() => onOpen(product, pick.variantChoice)}
          aria-label={`Подробнее: ${product.title}`}
          className="bg-paper-2 relative grid aspect-[16/10] w-full place-items-center overflow-hidden rounded-[14px]"
        >
          {image && (
            <img
              src={withBasePath(image.src)}
              alt={image.alt}
              className="absolute inset-0 size-full object-cover"
            />
          )}
          {pick.priority === "top" && (
            <span className="bg-velvet text-champagne absolute top-2 left-2 inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[13px] font-semibold">
              <Star
                aria-hidden
                size={13}
                strokeWidth={1.75}
                className="fill-champagne"
              />
              Очень хочу
            </span>
          )}
        </button>
        <div className="px-1 pt-3">
          <h3 className="text-title-2">{product.title}</h3>
          <p className="text-price mt-1.5">
            {formatPrice(product.priceMin, product.priceMax)}
          </p>
          {variant && (
            <p className="text-caption text-ink-soft mt-1.5">
              Подойдёт: {variant}
            </p>
          )}
          <ul className="border-ink/10 mt-3 border-t">
            {product.offers.map((offer) => (
              <li key={offer.url}>
                <a
                  href={offer.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border-ink/10 flex min-h-12 items-center gap-2.5 border-b last:border-b-0"
                >
                  <span className="flex-1 text-[15px] leading-5 font-medium">
                    {storeLabel(offer)}
                  </span>
                  <span className="text-[15px] font-semibold">
                    {formatPrice(offer.price)}
                  </span>
                  <ExternalLink
                    aria-hidden
                    size={18}
                    strokeWidth={1.75}
                    className="text-ink-soft"
                  />
                  <span className="sr-only">Открыть в магазине</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </article>
    </li>
  );
};

const AnswerContent = () => {
  const encoded = useSearchParams()?.get("d") ?? "";
  const [details, setDetails] = useState<{
    choice?: Record<string, string>;
    product: Product;
  } | null>(null);
  const isValid = decodePickAnswer(encoded) !== null;
  const imported = useQuery({
    queryKey: pickKeys.answer(encoded),
    queryFn: () => importPickAnswer(encoded),
    enabled: isValid,
    staleTime: Infinity,
  });

  if (
    !isValid ||
    (isApiError(imported.error) && imported.error.code === "VALIDATION")
  ) {
    return <BrokenLink />;
  }
  if (imported.isError) {
    return (
      <EmptyState
        className="h-full"
        title="Не получилось открыть выбор. Проверь связь и попробуй ещё раз."
        action={
          <Button variant="secondary" onClick={() => void imported.refetch()}>
            Попробовать ещё раз
          </Button>
        }
      />
    );
  }
  if (!imported.data) {
    return (
      <div className="flex flex-col gap-4 px-5 pt-6">
        <Skeleton className="size-14 rounded-full" />
        <Skeleton className="h-9 w-3/4" />
        <Skeleton tone="paper" className="h-72 rounded-[22px]" />
      </div>
    );
  }

  const { answer, request } = imported.data;
  // Свой запрос на этом устройстве — напоминаем, о какой подборке речь.
  const occasion = request ? occasionLabel(request.occasion) : "";

  return (
    <>
      <div className="px-5 pt-2.5 pb-1">
        <Avatar name={answer.by.name} color={answer.by.avatarColor} size={56} />
        <h1 className="text-title-1 mt-3.5">{headline(answer)}</h1>
        {request && (
          <p className="text-title-3 text-rose mt-0.5 italic">
            {occasion ? `${occasion}, ` : ""}
            {describeFilters(request.filters)}
          </p>
        )}
      </div>
      <ul className="flex flex-col gap-4 px-5 pt-[18px] pb-6">
        {answer.picks.map((pick) => (
          <PickCard
            key={pick.productId}
            pick={pick}
            onOpen={(product, choice) => setDetails({ product, choice })}
          />
        ))}
      </ul>
      <div className="px-5 pt-1 pb-[calc(env(safe-area-inset-bottom)+12px)] text-center">
        <Link
          href={ROUTES.GIFTS}
          className={buttonClassName({ variant: "secondary", size: "lg" })}
        >
          К подаркам
        </Link>
      </div>
      <ProductDetailsSheet
        product={details?.product ?? null}
        choice={details?.choice}
        choiceCaption="Выбрано"
        onClose={() => setDetails(null)}
      />
    </>
  );
};

// Ответ на ссылку-фильтр — сторона отправителя (DESIGN.md §8.6): список
// выбранного с вариантами и офферами.
export const PickAnswerPage = () => (
  <Screen>
    <div className="flex h-[52px] flex-none items-center px-5">
      <Link
        href={ROUTES.HOME}
        aria-label="SwipeIt"
        className="inline-flex min-h-11 items-center"
      >
        <Brand size="sm" />
      </Link>
    </div>
    <ScreenBody>
      <Suspense fallback={<ContentSkeleton />}>
        <AnswerContent />
      </Suspense>
    </ScreenBody>
  </Screen>
);
