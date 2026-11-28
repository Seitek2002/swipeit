"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";

import type { SantaView } from "@/entities/santa-game";

import {
  handOverSantaGame,
  isApiError,
  leaveSantaGame,
  removeSantaMember,
  santaKeys,
} from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { Avatar, BottomSheet, Button, ConfirmDialog, toast } from "@/shared/ui";

import {
  handOverCandidates,
  handOverCopy,
  removeMemberCopy,
} from "../model/member-actions";

const onError = (error: Error) =>
  toast(isApiError(error) ? error.message : "Не получилось. Попробуй ещё раз", {
    tone: "error",
  });

// «Убрать из игры» у строки участника — организатору (auto-tasks-pm-2 Q05):
// ссылку переслали дальше или коллега передумал. После жеребьёвки (R05) —
// коллега заболел или уволился: Санта убранного получит новое письмо.
// Убранный снова вступить не сможет.
export const RemoveMemberButton = ({
  view,
  member,
}: {
  member: { id: string; name: string };
  view: SantaView;
}) => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const copy = removeMemberCopy({
    name: member.name,
    gameTitle: view.game.title,
    drawn: view.game.status === "drawn",
  });
  const remove = useMutation({
    mutationFn: () => removeSantaMember(view.game.id, member.id),
    onSuccess: (next) => {
      setOpen(false);
      queryClient.setQueryData(santaKeys.detail(view.game.id), next);
      void queryClient.invalidateQueries({ queryKey: santaKeys.list() });
    },
    onError: (error: Error) => {
      setOpen(false);
      onError(error);
    },
  });
  return (
    <>
      <button
        type="button"
        aria-label={`Убрать из игры: ${member.name}`}
        onClick={() => setOpen(true)}
        className="text-rose -mr-2 grid size-11 flex-none place-items-center rounded-full"
      >
        <X aria-hidden size={18} strokeWidth={1.75} />
      </button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => remove.mutate()}
        isLoading={remove.isPending}
        title={copy.title}
        description={copy.description}
        confirmLabel="Убрать"
        variant="danger"
      />
    </>
  );
};

// «Выйти из игры» — участнику или позванному до жеребьёвки (Q05).
export const LeaveGameButton = ({ view }: { view: SantaView }) => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const leave = useMutation({
    mutationFn: () => leaveSantaGame(view.game.id),
    onSuccess: () => {
      setOpen(false);
      router.replace(ROUTES.SANTA);
      queryClient.removeQueries({ queryKey: santaKeys.detail(view.game.id) });
      void queryClient.invalidateQueries({ queryKey: santaKeys.list() });
      toast(`Готово — тебя нет в игре «${view.game.title}»`);
    },
    onError: (error: Error) => {
      setOpen(false);
      onError(error);
    },
  });
  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        Выйти из игры
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => leave.mutate()}
        isLoading={leave.isPending}
        title="Выйти из игры?"
        description={`Тебя уберут из «${view.game.title}» до жеребьёвки — подопечного у тебя не будет`}
        confirmLabel="Выйти"
        variant="danger"
      />
    </>
  );
};

// «Передать роль организатора» (auto-tasks-pm-4 S04) — организатору, до и
// после жеребьёвки: потерял телефон, уезжает, пусть игру ведёт другой. Кому —
// шторка со списком вступивших, потом подтверждение. Пары не меняются, и
// новый организатор их не увидит; ему придёт тост «Теперь ты организатор».
export const HandOverButton = ({
  view,
  meId,
}: {
  meId: string;
  view: SantaView;
}) => {
  const queryClient = useQueryClient();
  const [sheetOpen, setSheetOpen] = useState(false);
  // Кого выбрали — живёт и после закрытия подтверждения: иначе текст
  // пропал бы посреди анимации закрытия.
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const candidates = handOverCandidates(view, meId);
  const handOver = useMutation({
    mutationFn: (userId: string) => handOverSantaGame(view.game.id, userId),
    onSuccess: (next) => {
      setConfirmOpen(false);
      queryClient.setQueryData(santaKeys.detail(view.game.id), next);
      void queryClient.invalidateQueries({ queryKey: santaKeys.list() });
      toast(`Готово — игру ведёт ${picked?.name ?? ""}`);
    },
    onError: (error: Error) => {
      setConfirmOpen(false);
      onError(error);
    },
  });
  if (candidates.length === 0) return null;
  const copy = picked
    ? handOverCopy({ name: picked.name, drawn: view.game.status === "drawn" })
    : null;
  return (
    <>
      <Button variant="ghost" onClick={() => setSheetOpen(true)}>
        Передать роль организатора
      </Button>
      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Кому передать игру"
      >
        <p className="text-body text-rose mb-2">
          Новый организатор будет вести игру вместо тебя. Ты останешься
          участником.
        </p>
        <ul className="pb-2">
          {candidates.map((member) => (
            <li key={member.id} className="border-line border-b">
              <button
                type="button"
                onClick={() => {
                  setSheetOpen(false);
                  setPicked({ id: member.id, name: member.name });
                  setConfirmOpen(true);
                }}
                className="text-body text-paper flex min-h-[56px] w-full items-center gap-3 text-left font-semibold"
              >
                <Avatar
                  name={member.name}
                  color={member.avatarColor}
                  size={36}
                  decorative
                />
                {member.name}
              </button>
            </li>
          ))}
        </ul>
      </BottomSheet>
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => picked && handOver.mutate(picked.id)}
        isLoading={handOver.isPending}
        title={copy?.title ?? ""}
        description={copy?.description ?? ""}
        confirmLabel="Передать"
      />
    </>
  );
};
