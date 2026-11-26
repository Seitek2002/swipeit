"use client";

import { useState } from "react";

import Link from "next/link";

import { Plus, Share2 } from "lucide-react";
import { Reorder } from "motion/react";

import { AppHeader } from "@/widgets/app-header";

import { CustomWishSheet } from "@/features/custom-wish";
import {
  GivenSheet,
  type ItemAction,
  ItemActionsSheet,
  type ItemDisplay,
  NoteSheet,
  VariantSheet,
  useDeleteItem,
  useReorder,
  useRestoreItem,
  useUpdateItem,
} from "@/features/wishlist-edit";

import type { Product } from "@/entities/product";
import { useFriends } from "@/entities/user";
import { type WishlistItem, useMyWishlist } from "@/entities/wishlist";

import { ROUTES } from "@/shared/config";
import { occasionLabel, pluralize } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import {
  Button,
  EmptyState,
  IconButton,
  Screen,
  ScreenBody,
  SegmentedControl,
  Skeleton,
  buttonClassName,
  toast,
} from "@/shared/ui";

import { WishRow } from "./WishRow";

const UNLOCK_LIKES = 5;

type Tab = "given" | "want";
type Sheet = {
  display: ItemDisplay;
  item: WishlistItem;
  product?: Product;
  type: "given" | "menu" | "note" | "variant";
};

const byOrder = (a: WishlistItem, b: WishlistItem) => a.order - b.order;

// «Мой вишлист» (DESIGN.md §8.3).
export const WishlistPage = () => {
  const { data, isLoading, isError, refetch } = useMyWishlist();
  const friends = useFriends();
  const reorder = useReorder();
  const updateItem = useUpdateItem();
  const deleteItem = useDeleteItem();
  const restoreItem = useRestoreItem();

  const [tab, setTab] = useState<Tab>("want");
  const [sheet, setSheet] = useState<null | Sheet>(null);
  const [customOpen, setCustomOpen] = useState(false);
  // Порядок во время перетаскивания — локально; с «сервера» — когда не тащим.
  const [dragOrder, setDragOrder] = useState<{
    normal: string[];
    top: string[];
  } | null>(null);

  const items = data?.items ?? [];
  const active = items.filter((item) => item.status === "active").sort(byOrder);
  const given = items.filter((item) => item.status === "given").sort(byOrder);
  const top = active.filter((item) => item.priority === "top");
  const normal = active.filter((item) => item.priority === "normal");
  const topIds = dragOrder?.top ?? top.map((item) => item.id);
  const normalIds = dragOrder?.normal ?? normal.map((item) => item.id);
  const byId = new Map(active.map((item) => [item.id, item]));

  const unlocked = Boolean(data?.meta.shareUnlockedAt);
  const likesLeft = Math.max(0, UNLOCK_LIKES - (data?.likeCount ?? 0));
  const occasion = occasionLabel(data?.meta.occasion);

  const genderOf = (userId?: string) => {
    const audience = friends.data?.find(({ user }) => user.id === userId)?.user
      .audience;
    return audience === "female" || audience === "male" ? audience : undefined;
  };

  const commitOrder = (nextTop = topIds, nextNormal = normalIds) => {
    setDragOrder(null);
    const ids = [...nextTop, ...nextNormal];
    const current = [...top, ...normal].map((item) => item.id);
    if (ids.join() !== current.join())
      reorder.mutate([...ids, ...given.map((item) => item.id)]);
  };

  const move = (item: WishlistItem, delta: -1 | 1) => {
    const group = item.priority === "top" ? [...topIds] : [...normalIds];
    const index = group.indexOf(item.id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= group.length) return;
    [group[index], group[target]] = [group[target] ?? item.id, item.id];
    if (item.priority === "top") commitOrder(group, normalIds);
    else commitOrder(topIds, group);
  };

  const handleShare = () => {
    // Шторка отправки — в T09.
    toast("Отправка вишлиста появится совсем скоро", { tone: "info" });
  };

  const handleAction = (action: ItemAction, item: WishlistItem) => {
    const current = sheet;
    setSheet(null);
    if (!current) return;
    if (action === "note" || action === "variant" || action === "given") {
      // Меню уезжает, следующая шторка выезжает следом.
      setTimeout(() => setSheet({ ...current, type: action }), 230);
    } else if (action === "top") {
      updateItem.mutate({
        id: item.id,
        patch: { priority: item.priority === "top" ? "normal" : "top" },
      });
    } else if (action === "up" || action === "down") {
      move(item, action === "up" ? -1 : 1);
    } else if (action === "delete") {
      deleteItem.mutate(item);
    } else if (action === "restore") {
      restoreItem.mutate(item.id);
    }
  };

  const openMenu = (
    item: WishlistItem,
    display: ItemDisplay,
    product?: Product,
  ) => setSheet({ type: "menu", item, display, product });

  const groupIds = sheet?.item.priority === "top" ? topIds : normalIds;
  const sheetIndex = sheet ? groupIds.indexOf(sheet.item.id) : -1;
  const showFooter = tab === "want" && active.length > 0;

  const renderGroup = (ids: string[], key: "normal" | "top") => (
    <Reorder.Group
      axis="y"
      values={ids}
      onReorder={(next: string[]) =>
        setDragOrder({
          top: key === "top" ? next : topIds,
          normal: key === "normal" ? next : normalIds,
        })
      }
      className="flex flex-col gap-2.5"
    >
      {ids.map((id) => {
        const item = byId.get(id);
        return item ? (
          <WishRow
            key={id}
            item={item}
            genderOf={genderOf}
            reorderable
            onMenu={openMenu}
            onDragEnd={() => commitOrder()}
          />
        ) : null;
      })}
    </Reorder.Group>
  );

  return (
    <Screen>
      <AppHeader
        title="Мой вишлист"
        actions={
          unlocked && (
            <IconButton label="Отправить вишлист" onClick={handleShare}>
              <Share2 aria-hidden size={22} strokeWidth={1.75} />
            </IconButton>
          )
        }
      />
      <ScreenBody
        className={cn(showFooter && "pb-[calc(var(--tabbar-space)+96px)]")}
      >
        {occasion && <p className="text-title-3 text-paper px-5">{occasion}</p>}
        <SegmentedControl
          className="mx-5 mt-4"
          label="Вишлист"
          value={tab}
          onChange={setTab}
          options={[
            { value: "want", label: `Хочу ${active.length}` },
            { value: "given", label: `Подарили ${given.length}` },
          ]}
        />

        {isLoading && (
          <div className="flex flex-col gap-2.5 px-5 pt-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton
                key={index}
                tone="paper"
                className="h-20 rounded-[18px]"
              />
            ))}
          </div>
        )}

        {isError && (
          <EmptyState
            className="pt-10"
            title="Не получилось загрузить вишлист."
            action={
              <Button variant="secondary" onClick={() => void refetch()}>
                Попробовать ещё раз
              </Button>
            }
          />
        )}

        {data && tab === "want" && (
          <div className="flex flex-col gap-2.5 px-5 pt-4">
            {active.length === 0 ? (
              <EmptyState
                className="pt-6 pb-4"
                title="Пока пусто. Свайпни пару подарков — они появятся здесь."
                action={
                  <Link
                    href={ROUTES.GIFTS}
                    className={buttonClassName({ variant: "primary" })}
                  >
                    Смотреть подарки
                  </Link>
                }
              />
            ) : (
              <>
                {topIds.length > 0 && renderGroup(topIds, "top")}
                {normalIds.length > 0 && renderGroup(normalIds, "normal")}
              </>
            )}
            <button
              type="button"
              onClick={() => setCustomOpen(true)}
              className="text-rose flex h-14 items-center justify-center gap-2 rounded-[18px] border-[1.5px] border-dashed border-[rgb(255_241_243/0.28)] text-[15px] leading-5 font-semibold"
            >
              <Plus aria-hidden size={20} strokeWidth={1.75} />
              Своё желание
            </button>
          </div>
        )}

        {data && tab === "given" && (
          <div className="px-5 pt-4">
            {given.length === 0 ? (
              <EmptyState
                className="pt-6"
                title="Здесь будут подарки, которые тебе уже подарили"
              />
            ) : (
              <ul className="flex flex-col gap-2.5">
                {given.map((item) => (
                  <WishRow
                    key={item.id}
                    item={item}
                    genderOf={genderOf}
                    reorderable={false}
                    onMenu={openMenu}
                  />
                ))}
              </ul>
            )}
          </div>
        )}
      </ScreenBody>

      {showFooter && (
        <div className="from-velvet pointer-events-none absolute inset-x-0 bottom-0 z-30 bg-linear-to-t from-60% to-transparent px-5 pt-7 pb-[calc(var(--tabbar-space)-8px)]">
          <Button
            size="lg"
            className="pointer-events-auto"
            disabled={!unlocked}
            onClick={handleShare}
          >
            Отправить вишлист
          </Button>
          {!unlocked && (
            <p className="text-caption text-rose mt-2 text-center">
              Ещё {pluralize(likesLeft, ["желание", "желания", "желаний"])} — и
              можно отправить
            </p>
          )}
        </div>
      )}

      <ItemActionsSheet
        item={sheet?.type === "menu" ? sheet.item : null}
        display={sheet?.display}
        hasVariants={Boolean(sheet?.product?.variants?.length)}
        canMoveUp={sheetIndex > 0}
        canMoveDown={sheetIndex >= 0 && sheetIndex < groupIds.length - 1}
        onAction={handleAction}
        onClose={() => setSheet(null)}
      />
      <NoteSheet
        item={sheet?.type === "note" ? sheet.item : null}
        onClose={() => setSheet(null)}
      />
      <VariantSheet
        item={sheet?.type === "variant" ? sheet.item : null}
        product={sheet?.product}
        onClose={() => setSheet(null)}
      />
      <GivenSheet
        item={sheet?.type === "given" ? sheet.item : null}
        display={sheet?.display}
        onClose={() => setSheet(null)}
      />
      <CustomWishSheet open={customOpen} onClose={() => setCustomOpen(false)} />
    </Screen>
  );
};
