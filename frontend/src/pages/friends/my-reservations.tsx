"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Gift } from "lucide-react";

import {
  cheapestOffer,
  imageForChoice,
  storeLabel,
  useProduct,
} from "@/entities/product";

import {
  type MyReservation,
  createReservation,
  deleteReservation,
  getMyReservations,
  reservationKeys,
} from "@/shared/api";
import { withBasePath } from "@/shared/lib/base-path";
import { useMounted } from "@/shared/lib/dom";
import { occasionLabel } from "@/shared/lib/format";
import { Button, toast } from "@/shared/ui";

// Куда идти покупать: товар — в самый дешёвый магазин, своё желание — по
// ссылке владельца.
const buyLinkOf = (
  reservation: MyReservation,
  product: ReturnType<typeof useProduct>["data"],
) => {
  if (product) {
    const offer = cheapestOffer(product);
    return { href: offer.url, label: `Купить на ${storeLabel(offer)}` };
  }
  const url = reservation.item.custom?.url;
  return url ? { href: url, label: "Где купить" } : null;
};

const ReservationRow = ({
  reservation,
  onCancel,
  cancelling,
}: {
  cancelling: boolean;
  onCancel: () => void;
  reservation: MyReservation;
}) => {
  const { data: product } = useProduct(reservation.item.productId);
  const image = product ? imageForChoice(product) : undefined;
  const title = product?.title ?? reservation.item.custom?.title ?? "…";
  const occasion = occasionLabel(reservation.occasion);
  const buy = reservation.closed ? null : buyLinkOf(reservation, product);

  return (
    <li
      className={`border-line flex gap-3 border-b py-3 ${reservation.closed ? "opacity-60" : ""}`}
    >
      <span className="bg-paper-2 grid size-14 flex-none place-items-center overflow-hidden rounded-[12px]">
        {image ? (
          <img
            src={withBasePath(image.src)}
            alt=""
            className="size-full object-cover"
          />
        ) : (
          <Gift
            aria-hidden
            size={24}
            strokeWidth={1.5}
            className="text-ink-soft"
          />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-body text-paper block font-semibold">
          {title}
        </span>
        <span className="text-caption text-rose block">
          {reservation.owner.name}
          {occasion ? ` · ${occasion}` : ""}
          {reservation.closed ? " · уже подарено" : ""}
        </span>
        {!reservation.closed && (
          <span className="mt-1 flex flex-wrap items-center gap-x-3">
            {buy && (
              <a
                href={buy.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-mandarin flex min-h-11 items-center gap-1.5 text-[15px] leading-5 font-semibold"
              >
                {buy.label}
                <ExternalLink aria-hidden size={16} strokeWidth={2} />
              </a>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="text-rose -ml-2"
              loading={cancelling}
              onClick={onCancel}
            >
              Отменить бронь
            </Button>
          </span>
        )}
      </span>
    </li>
  );
};

// «Я дарю» на «Друзьях» (auto-tasks P02): свои брони в одном месте —
// ближайший повод сверху, «Уже подарено» внизу приглушённо. Нет броней —
// раздела нет.
export const MyReservations = () => {
  const mounted = useMounted();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: reservationKeys.mine(),
    queryFn: () => getMyReservations(),
    enabled: mounted,
  });

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: reservationKeys.all });

  const cancel = useMutation({
    mutationFn: (reservation: MyReservation) =>
      deleteReservation(reservation.id),
    onSuccess: (_result, reservation) =>
      toast("Бронь снята", {
        action: {
          label: "Вернуть",
          onClick: () =>
            void createReservation({
              ownerId: reservation.owner.id,
              itemKey: reservation.itemKey,
            })
              .catch(() =>
                toast("Не получилось вернуть бронь — кто-то успел раньше", {
                  tone: "error",
                }),
              )
              .finally(() => void refresh()),
        },
      }),
    onError: () => toast("Не получилось снять бронь", { tone: "error" }),
    onSettled: () => void refresh(),
  });

  const list = query.data ?? [];
  if (list.length === 0) return null;

  return (
    <section className="mt-5 px-5" aria-labelledby="my-reservations-title">
      <h2 id="my-reservations-title" className="text-label">
        Я дарю
      </h2>
      <ul className="mt-1">
        {list.map((reservation) => (
          <ReservationRow
            key={reservation.id}
            reservation={reservation}
            cancelling={
              cancel.isPending && cancel.variables?.id === reservation.id
            }
            onCancel={() => cancel.mutate(reservation)}
          />
        ))}
      </ul>
    </section>
  );
};
