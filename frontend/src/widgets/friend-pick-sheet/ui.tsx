"use client";

import { NAME_CAPTIONS, NameForm, useRequireName } from "@/features/ask-name";
import { PickRequestSheet } from "@/features/pick-request-create";
import { describeFilters } from "@/features/product-filters";

import { EMPTY_FILTERS } from "@/entities/product";

type Props = {
  friendName: string;
  onClose: () => void;
  open: boolean;
};

// «Предложить выбрать подарок» (DESIGN.md §8.6 «Где начать»): та же шторка
// ссылки-фильтра, что из фильтров ленты, но фильтры пустые — друг выбирает
// из всего каталога, — а «кому» уже заполнено его именем. Профиль друга и
// баннер дня рождения в «Друзьях» открывают одно и то же.
export const FriendPickSheet = ({ friendName, open, onClose }: Props) => {
  // Друг увидит «Азамат хочет подарить тебе подарок»: нет имени — NameSheet
  // первым шагом шторки; NAME_REQUIRED — поверх и повтор (как в «Подарках»).
  const requireName = useRequireName(NAME_CAPTIONS.pick);

  return (
    <>
      <PickRequestSheet
        // «Кому» читается при монтировании: у другого друга — своя шторка.
        key={friendName}
        open={open}
        onClose={onClose}
        filters={EMPTY_FILTERS}
        conditions={describeFilters(EMPTY_FILTERS)}
        defaultToName={friendName}
        nameStep={
          requireName.needsName ? (
            <NameForm caption={NAME_CAPTIONS.pick} />
          ) : undefined
        }
        onShareError={requireName.handleError}
      />
      {requireName.sheet}
    </>
  );
};
