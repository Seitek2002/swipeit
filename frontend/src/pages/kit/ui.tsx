"use client";

import { type ReactNode, useState } from "react";

import { Plus, Share2, SlidersHorizontal } from "lucide-react";

import { AppHeader } from "@/widgets/app-header";

import { AVATAR_COLORS } from "@/shared/config";
import { getScrollLockCount } from "@/shared/lib/useScrollLock";
import {
  Avatar,
  AvatarStack,
  BottomSheet,
  type BudgetRange,
  Button,
  Chip,
  ConfirmDialog,
  Countdown,
  EmptyState,
  IconButton,
  ProgressDots,
  RangeSlider,
  Screen,
  ScreenBody,
  SegmentedControl,
  Skeleton,
  Spinner,
  StoreTag,
  SwipeActionButton,
  TextArea,
  TextField,
  toast,
} from "@/shared/ui";

const PEOPLE = [
  { id: "1", name: "Айгерим", color: "mandarin" as const },
  { id: "2", name: "Азамат", color: "mint" as const },
  { id: "3", name: "Нурай", color: "champagne" as const },
  { id: "4", name: "Данияр", color: "rose" as const },
  { id: "5", name: "Мээрим", color: "pomegranate" as const },
  { id: "6", name: "Тимур", color: "plum" as const },
  { id: "7", name: "Бекзат", color: "olive" as const },
];

const CATEGORIES = ["Техника", "Красота", "Дом", "Спорт", "Книги"];

const Section = ({
  title,
  children,
}: {
  children: ReactNode;
  title: string;
}) => (
  <section className="border-line border-t pt-6 pb-8">
    <h2 className="text-title-2 mb-4">{title}</h2>
    <div className="flex flex-col gap-4">{children}</div>
  </section>
);

const Row = ({ children }: { children: ReactNode }) => (
  <div className="flex flex-wrap items-center gap-3">{children}</div>
);

// Витрина UI-кита (T03): все компоненты shared/ui во всех состояниях. Открыта
// только в режиме разработки (app/kit/page.tsx).
export const KitPage = () => {
  const [segment, setSegment] = useState<"all" | "female" | "male">("all");
  const [selected, setSelected] = useState<string[]>(["Техника"]);
  const [filters, setFilters] = useState(["до 5 000 сом", "Техника"]);
  const [budget, setBudget] = useState<BudgetRange>({ min: 0, max: 5000 });
  const [name, setName] = useState("");
  const [note, setNote] = useState("Мне — чёрный, M");
  const [sheet, setSheet] = useState<"auto" | "full" | null>(null);
  const [nested, setNested] = useState(false);
  const [confirm, setConfirm] = useState<"danger" | "default" | null>(null);
  const [locks, setLocks] = useState(0);
  const [in2days] = useState(() => Date.now() + 2 * 86_400_000 + 4 * 3_600_000);
  const [in30min] = useState(() => Date.now() + 30 * 60_000 + 5000);

  const toggle = (category: string) =>
    setSelected((list) =>
      list.includes(category)
        ? list.filter((item) => item !== category)
        : [...list, category],
    );

  return (
    <Screen>
      <AppHeader title="Витрина" showAvatar={false} />
      <ScreenBody className="px-5 pt-2">
        <Section title="Типографика">
          <p className="text-display">Решено: кино</p>
          <p className="text-title-1">Мой вишлист</p>
          <p className="text-title-2">Аромасвеча «Инжир и кедр»</p>
          <p className="text-title-3">на день рождения, 14 марта</p>
          <p className="text-body-lg">Описание в шторке, 17/26.</p>
          <p className="text-body">Основной текст 15/22.</p>
          <p className="text-price">2 990 – 3 600 сом</p>
          <p className="text-caption text-rose">Ещё 3 — и можно отправить</p>
          <p className="text-body">Ёлка, щётка, Үй, Өрүк, Ңы</p>
          <p className="text-title-2">Ёлка, щётка, Үй, Өрүк, Ңы</p>
        </Section>

        <Section title="Кнопки">
          <Button size="lg">Отправить вишлист</Button>
          <Button size="lg" variant="secondary">
            Выбрать самим
          </Button>
          <Row>
            <Button>Крутить барабан</Button>
            <Button variant="paper">Хочу</Button>
          </Row>
          <Row>
            <Button variant="ghost">Отмена</Button>
            <Button variant="danger">Удалить</Button>
            <Button size="sm" variant="secondary">
              Да, подарили
            </Button>
          </Row>
          <Row>
            <Button loading>Отправить</Button>
            <Button disabled>Ещё 2 желания</Button>
          </Row>
          <Button
            variant="secondary"
            icon={<Plus aria-hidden size={20} strokeWidth={1.75} />}
          >
            Своё желание
          </Button>
        </Section>

        <Section title="Иконки и свайп-кнопки">
          <Row>
            <IconButton label="Фильтры" badge={2}>
              <SlidersHorizontal aria-hidden size={22} strokeWidth={1.75} />
            </IconButton>
            <IconButton label="Поделиться">
              <Share2 aria-hidden size={22} strokeWidth={1.75} />
            </IconButton>
            <IconButton label="Недоступно" disabled>
              <Share2 aria-hidden size={22} strokeWidth={1.75} />
            </IconButton>
          </Row>
          <div className="flex items-center justify-center gap-[18px]">
            <SwipeActionButton action="undo" />
            <SwipeActionButton action="pass" />
            <SwipeActionButton action="super" />
            <SwipeActionButton action="like" />
          </div>
          <p className="text-caption text-rose">
            При перетаскивании (прогресс 1):
          </p>
          <div className="flex items-center justify-center gap-[18px]">
            <SwipeActionButton action="undo" disabled />
            <SwipeActionButton action="pass" progress={1} />
            <SwipeActionButton action="super" progress={1} />
            <SwipeActionButton action="like" progress={1} />
          </div>
        </Section>

        <Section title="Чипы">
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((category) => (
              <Chip
                key={category}
                selected={selected.includes(category)}
                onClick={() => toggle(category)}
              >
                {category}
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {filters.map((filter) => (
              <Chip
                key={filter}
                onRemove={() =>
                  setFilters((list) => list.filter((item) => item !== filter))
                }
                removeLabel={`Убрать фильтр «${filter}»`}
              >
                {filter}
              </Chip>
            ))}
            <Chip locked>Техника и Спорт</Chip>
          </div>
          <Row>
            <StoreTag>Wildberries</StoreTag>
            <StoreTag>Ozon</StoreTag>
            <StoreTag>AliExpress</StoreTag>
          </Row>
        </Section>

        <Section title="Поля">
          <TextField
            label="Как тебя зовут?"
            placeholder="Имя"
            value={name}
            onChange={(event) => setName(event.target.value)}
            hint="Его увидят друзья"
          />
          <TextField
            label="Ссылка"
            defaultValue="не ссылка"
            error="Проверь ссылку: она должна начинаться с https://"
          />
          <TextArea
            label="Заметка"
            maxLength={140}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </Section>

        <Section title="Переключатели и бюджет">
          <SegmentedControl
            label="Показывать подарки"
            value={segment}
            onChange={setSegment}
            options={[
              { value: "all", label: "всем" },
              { value: "female", label: "для неё" },
              { value: "male", label: "для него" },
            ]}
          />
          <RangeSlider label="Бюджет" value={budget} onChange={setBudget} />
          <ProgressDots count={3} current={1} />
        </Section>

        <Section title="Аватары">
          <Row>
            {AVATAR_COLORS.map((color, index) => (
              <Avatar
                key={color}
                color={color}
                name={PEOPLE[index % PEOPLE.length]?.name ?? "Я"}
              />
            ))}
          </Row>
          <Row>
            <AvatarStack people={PEOPLE.slice(0, 3)} />
            <AvatarStack people={PEOPLE} />
            <Avatar color="mint" name="Азамат" size={56} />
          </Row>
        </Section>

        <Section title="Состояния">
          <Row>
            <Spinner />
            <Countdown to={in2days} />
          </Row>
          <Countdown to={in30min} />
          <div className="flex gap-3">
            <Skeleton className="h-24 flex-1" />
            <Skeleton tone="paper" className="h-24 flex-1" />
          </div>
          <EmptyState
            title="Пока пусто. Свайпни пару подарков — они появятся здесь."
            action={<Button>Смотреть подарки</Button>}
          />
          <EmptyState object="ticket" title="Планов пока нет" />
          <EmptyState object="envelope" title="Игр пока нет" />
        </Section>

        <Section title="Тосты">
          <Row>
            <Button
              variant="secondary"
              onClick={() => toast("Ссылка скопирована")}
            >
              Обычный
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                toast("Перенесено в «Подарили»", {
                  action: {
                    label: "Отменить",
                    onClick: () => toast("Вернули в вишлист", { tone: "info" }),
                  },
                })
              }
            >
              С отменой
            </Button>
          </Row>
          <Row>
            <Button
              variant="secondary"
              onClick={() =>
                toast("Нет связи с ноутбуком. Переподключаемся…", {
                  tone: "loading",
                  duration: null,
                })
              }
            >
              Без автозакрытия
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                toast("Не получилось. Попробуй ещё раз", { tone: "error" })
              }
            >
              Ошибка
            </Button>
          </Row>
        </Section>

        <Section title="Шторки и диалог">
          <Row>
            <Button variant="secondary" onClick={() => setSheet("auto")}>
              Шторка
            </Button>
            <Button variant="secondary" onClick={() => setSheet("full")}>
              Высокая шторка
            </Button>
          </Row>
          <Row>
            <Button variant="secondary" onClick={() => setConfirm("default")}>
              Диалог
            </Button>
            <Button variant="secondary" onClick={() => setConfirm("danger")}>
              Удаление
            </Button>
          </Row>
          <Row>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setLocks(getScrollLockCount())}
            >
              Проверить блокировку
            </Button>
            <span className="text-caption text-rose" data-testid="lock-count">
              Блокировок прокрутки: {locks}
            </span>
          </Row>
        </Section>
      </ScreenBody>

      <BottomSheet
        open={sheet !== null}
        onClose={() => setSheet(null)}
        title="Фильтры"
        height={sheet === "full" ? "full" : "auto"}
        headerExtra={
          <Button size="sm" variant="ghost">
            Сбросить
          </Button>
        }
        footer={
          <>
            <Button size="lg" onClick={() => setNested(true)}>
              Открыть вторую шторку
            </Button>
            <Button variant="ghost" onClick={() => setSheet(null)}>
              Закрыть
            </Button>
          </>
        }
      >
        <p className="text-body text-rose">
          Закрывается свайпом вниз за язычок или заголовок, тапом по фону и
          Escape. Фокус не выходит за шторку по Tab.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {CATEGORIES.map((category) => (
            <Chip
              key={category}
              selected={selected.includes(category)}
              onClick={() => toggle(category)}
            >
              {category}
            </Chip>
          ))}
        </div>
        {sheet === "full" &&
          Array.from({ length: 12 }, (_, index) => (
            <p key={index} className="text-body text-rose mt-4">
              Строка {index + 1}: длинное содержимое прокручивается внутри
              шторки, футер остаётся на месте.
            </p>
          ))}
      </BottomSheet>

      <BottomSheet
        open={nested}
        onClose={() => setNested(false)}
        title="Вторая шторка"
        footer={
          <Button
            size="lg"
            variant="paper"
            onClick={() => {
              setLocks(getScrollLockCount());
              setNested(false);
            }}
          >
            Закрыть верхнюю
          </Button>
        }
      >
        <p className="text-body text-rose">
          Закрой эту — первая останется открытой, а прокрутка под ней —
          заблокированной.
        </p>
      </BottomSheet>

      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          toast(
            confirm === "danger"
              ? "Демо-данные сброшены"
              : "Жеребьёвка проведена",
          );
        }}
        variant={confirm ?? "default"}
        title={
          confirm === "danger"
            ? "Сбросить демо-данные?"
            : "Провести жеребьёвку?"
        }
        description={
          confirm === "danger"
            ? "Вишлист, планы и игры удалятся с этого устройства."
            : "Поменять пары потом нельзя."
        }
        confirmLabel={confirm === "danger" ? "Сбросить" : "Провести"}
      />
    </Screen>
  );
};
