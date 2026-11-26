"use client";

import { useRouter } from "next/navigation";

import { ROUTES } from "@/shared/config";
import { pluralize } from "@/shared/lib/format";
import { BottomSheet, Bow, Button } from "@/shared/ui";

type Props = {
  count: number;
  onClose: () => void;
  open: boolean;
};

// «Вишлист готов» — после банта на 5-м «Хочу» (DESIGN.md §6). Отправка
// откроется на экране вишлиста (шторка отправки — T09).
export const WishlistReadySheet = ({ open, count, onClose }: Props) => {
  const router = useRouter();
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      ariaLabel="Вишлист готов"
      footer={
        <>
          <Button size="lg" onClick={() => router.push(ROUTES.WISHLIST)}>
            Отправить вишлист
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Свайпать дальше
          </Button>
        </>
      }
    >
      <div className="px-1 pt-2 pb-1 text-center">
        <Bow className="mx-auto" />
        <h2 className="text-title-1 mt-3.5">Вишлист готов</h2>
        <p className="text-body text-rose mt-2.5">
          {pluralize(count, ["желание", "желания", "желаний"])} уже в списке.
          Отправь его тем, кто будет дарить: они увидят, что ты хочешь, и не
          повторятся.
        </p>
      </div>
    </BottomSheet>
  );
};
