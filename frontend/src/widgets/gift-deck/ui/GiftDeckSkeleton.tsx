"use client";

import { SwipeDeck } from "@/features/swipe-deck";

import { GiftCardSkeleton, type Product } from "@/entities/product";

import { WishRibbon } from "./WishRibbon";

const noop = () => undefined;

// Колода, пока вкладка ещё запускается (DESIGN.md §6 «Прелоадер»: после
// прелоадера — скелетон, а не логотип). Та же разметка, что у GiftDeck в
// загрузке: лента из 5 сегментов и скелетон фото-карточки с переливом, —
// поэтому при подмене на настоящую колоду ничего не сдвигается.
export const GiftDeckSkeleton = () => (
  <div className="flex min-h-0 flex-1 flex-col">
    <WishRibbon likes={0} drawingBow={false} onBowDone={noop} />
    <SwipeDeck<Product>
      items={[]}
      getKey={(product) => product.id}
      getLabel={(product) => product.title}
      renderPhotoCard={() => null}
      onDecision={noop}
      disabled
      empty={<GiftCardSkeleton />}
    />
  </div>
);
