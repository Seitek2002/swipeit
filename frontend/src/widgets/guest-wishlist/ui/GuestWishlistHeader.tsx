import type { Occasion } from "@/shared/api";
import { genitive, occasionLabel } from "@/shared/lib/format";
import { Avatar } from "@/shared/ui";

type Props = {
  message?: string;
  occasion?: null | Occasion;
  owner: {
    avatarColor: Parameters<typeof Avatar>[0]["color"];
    name: string;
  };
  // Пол для «Вишлист Азамата»; у гостя по ссылке неизвестен.
  ownerGender?: "female" | "male";
  titleAs?: "h1" | "h2";
};

// Шапка чужого вишлиста (DESIGN.md §8.5): владелец, повод, сообщение. У гостя
// по ссылке всё это лежит в самой ссылке (d=) — шапка рисуется сразу, не
// дожидаясь каталога (UX-аудит H2), а бирки — скелетонами.
export const GuestWishlistHeader = ({
  owner,
  occasion,
  message,
  ownerGender,
  titleAs: Title = "h1",
}: Props) => {
  const occasionText = occasionLabel(occasion ?? undefined);
  return (
    <div className="px-5 pt-2.5 pb-1">
      <Avatar name={owner.name} color={owner.avatarColor} size={56} />
      <Title className="text-title-1 mt-3.5">
        {/* Без имени (профиль, открытый по прямому id) — без «Вишлист ». */}
        {owner.name.trim()
          ? `Вишлист ${genitive(owner.name, ownerGender)}`
          : "Вишлист"}
      </Title>
      {occasionText && (
        <p className="text-title-3 text-rose mt-0.5">{occasionText}</p>
      )}
      {message && (
        <p className="text-body bg-velvet-2 text-paper mt-3 rounded-[14px_14px_14px_4px] px-3.5 py-3">
          {message}
        </p>
      )}
    </div>
  );
};
