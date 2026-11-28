"use client";

import { useState } from "react";

import { useMe } from "@/entities/user";

import { Button } from "@/shared/ui";

import { NAME_CAPTIONS, namesakeText } from "../model";
import { NameSheet } from "./NameSheet";

// Подпись под «Вступить», когда в игре или плане уже есть человек с моим
// именем (auto-tasks-pm-3 R04), и «Изменить имя» — та же NameSheet с
// текущим именем. Вступление не блокируем: тёзки бывают и настоящие.
export const NamesakeNote = ({
  name,
  place,
}: {
  // Имя тёзки, как его видят в списке.
  name: string;
  place: "plan" | "santa";
}) => {
  const me = useMe();
  const [editing, setEditing] = useState(false);
  return (
    <div className="flex flex-col items-center gap-1">
      <p className="text-caption text-rose text-center">
        {namesakeText(name, place)}
      </p>
      <Button variant="ghost" onClick={() => setEditing(true)}>
        Изменить имя
      </Button>
      <NameSheet
        open={editing}
        caption={NAME_CAPTIONS[place]}
        initialName={me.data?.name ?? ""}
        onClose={() => setEditing(false)}
        onSaved={() => setEditing(false)}
      />
    </div>
  );
};
