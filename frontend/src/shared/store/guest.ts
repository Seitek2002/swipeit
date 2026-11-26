import { nanoid } from "nanoid";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type GuestState = {
  // Гость без профиля открыл вишлист по ссылке: id для его броней и имя,
  // которое он назвал при первой брони (DESIGN.md §8.5).
  guestId: string;
  name: string;
  setName: (name: string) => void;
};

export const useGuestStore = create<GuestState>()(
  persist(
    (set) => ({
      guestId: `g_${nanoid(10)}`,
      name: "",
      setName: (name) => set({ name }),
    }),
    { name: "swipeit:guest", storage: createJSONStorage(() => localStorage) },
  ),
);
