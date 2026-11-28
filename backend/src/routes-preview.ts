import type { PickRequest } from "@swipeit/core/api/pick/types";
import {
  formatDayMonth,
  formatPrice,
  genitive,
  occasionLabel,
  pluralize,
} from "@swipeit/core/format";
import { isApiError } from "@swipeit/core/errors";
import { occasionForOthersFrom } from "@swipeit/core/logic/occasion";
import { and, count, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

import type { Clock } from "./context";
import type { Db } from "./db/client";
import {
  pickAnswers,
  pickRequests,
  plans,
  santaGames,
  users,
  wishlistItems,
} from "./db/schema";
import { datesOf } from "./domains/dates/handlers";
import { resolveShareLink } from "./domains/share/links";
import { readMeta, rowToMeta } from "./domains/wishlist/queries";

// Превью коротких ссылок (BACKEND.md §6.3, B16): /s/<код> — маленькая HTML-
// страница с тегами og для Telegram и WhatsApp (они JavaScript не выполняют)
// и мгновенным переходом на экран фронта. В превью не попадают сообщение
// владельца, заметки и своё название значимой даты. Все тексты из базы —
// ввод людей: экранируем.

const escapeHtml = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

type Preview = { description: string; path: string; title: string };

const genderOf = (audience: string) =>
  audience === "female" || audience === "male" ? audience : undefined;

const CLOSED: Preview = {
  title: "SwipeIt",
  description: "Ссылка больше не работает",
  path: "/",
};

const previewOf = async (db: Db, code: string, now: number): Promise<Preview> =>
  db.db.transaction(async (tx) => {
    const link = await resolveShareLink(tx, code);
    const userOf = async (id: string) =>
      (await tx.select().from(users).where(eq(users.id, id)).limit(1))[0];
    switch (link.kind) {
      case "wishlist": {
        const owner = await userOf(link.targetId);
        if (!owner || owner.deletedAt) return CLOSED;
        const meta = rowToMeta(owner.id, await readMeta(tx, owner.id));
        // Повод — только дата и готовый повод, без своего названия.
        const occasion = occasionForOthersFrom(
          await datesOf(tx, owner.id),
          meta.occasion,
          now,
        );
        const [{ wishes = 0 } = {}] = await tx
          .select({ wishes: count() })
          .from(wishlistItems)
          .where(
            and(
              eq(wishlistItems.ownerId, owner.id),
              eq(wishlistItems.status, "active"),
            ),
          );
        const label =
          occasion && occasion.kind !== "just_because"
            ? occasionLabel(occasion, now)
            : "";
        return {
          title: `Вишлист ${genitive(owner.name ?? "", genderOf(owner.audience))}`,
          description: [
            label,
            pluralize(wishes, ["желание", "желания", "желаний"]),
          ]
            .filter(Boolean)
            .join(" · "),
          path: `/w/?s=${code}`,
        };
      }
      case "pick_request": {
        const [request] = await tx
          .select()
          .from(pickRequests)
          .where(eq(pickRequests.id, link.targetId))
          .limit(1);
        const from = request ? await userOf(request.fromUserId) : undefined;
        if (!request || !from) return CLOSED;
        const filters = request.filters as PickRequest["filters"];
        const max = filters.budget?.max;
        return {
          title: `${from.name ?? "Друг"} хочет подарить тебе подарок`,
          description:
            max && !request.hidePrices
              ? `Выбери сам — подарки до ${formatPrice(max)}`
              : "Выбери сам, что тебе нравится",
          path: `/pick/?s=${code}`,
        };
      }
      case "pick_answer": {
        const [requestId = "", byUserId = ""] = link.targetId.split(":");
        const [answer] = await tx
          .select()
          .from(pickAnswers)
          .where(
            and(
              eq(pickAnswers.requestId, requestId),
              eq(pickAnswers.byUserId, byUserId),
            ),
          )
          .limit(1);
        const by = await userOf(byUserId);
        if (!answer || !by) return CLOSED;
        const picks = Array.isArray(answer.picks) ? answer.picks.length : 0;
        const verb =
          by.audience === "female"
            ? "выбрала"
            : by.audience === "male"
              ? "выбрал"
              : "";
        const gifts = pluralize(picks, ["подарок", "подарка", "подарков"]);
        return {
          title: verb
            ? `${by.name ?? "Друг"} ${verb} ${gifts}`
            : `${by.name ?? "Друг"}: выбрано ${gifts}`,
          description: "Открой — посмотрим, что понравилось",
          path: `/pick/answer/?s=${code}`,
        };
      }
      case "plan": {
        const [plan] = await tx
          .select()
          .from(plans)
          .where(eq(plans.id, link.targetId))
          .limit(1);
        const owner = plan ? await userOf(plan.ownerId) : undefined;
        if (!plan) return CLOSED;
        return {
          title: `${owner?.name || "Друг"} зовёт: «${plan.title}»`,
          description:
            "Че делать будем? Свайпнем занятия и посмотрим, что совпадёт",
          path: `/plans/join/?id=${plan.id}`,
        };
      }
      case "santa": {
        const [game] = await tx
          .select()
          .from(santaGames)
          .where(eq(santaGames.id, link.targetId))
          .limit(1);
        if (!game) return CLOSED;
        return {
          title: `Тайный Санта «${game.title}»`,
          description: `бюджет ${formatPrice(game.budget)}, обмен ${formatDayMonth(game.exchangeDate)}`,
          path: `/santa/join/?id=${game.id}`,
        };
      }
      default:
        return CLOSED;
    }
  });

const page = (preview: Preview, frontUrl: string, selfUrl: string) => {
  const target = `${frontUrl}${preview.path}`;
  const title = escapeHtml(preview.title);
  const description = escapeHtml(preview.description);
  const image = escapeHtml(`${frontUrl}/og.png`);
  const href = escapeHtml(target);
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<meta property="og:type" content="website">
<meta property="og:site_name" content="SwipeIt">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:image" content="${image}">
<meta property="og:url" content="${escapeHtml(selfUrl)}">
<meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0; url=${href}">
<script>location.replace(${JSON.stringify(target).replaceAll("<", "\\u003c")})</script>
</head><body><p>${description}</p><p><a href="${href}">Открыть</a></p></body></html>`;
};

export const registerPreview = (
  app: FastifyInstance,
  deps: { clock: Clock; db: Db; frontUrl: string; publicShareUrl: string },
) => {
  app.get<{ Params: { code: string } }>("/s/:code", async (request, reply) => {
    const code = request.params.code;
    let preview = CLOSED;
    if (/^[A-Za-z0-9]{6,20}$/.test(code)) {
      try {
        preview = await previewOf(deps.db, code, deps.clock.now());
      } catch (error) {
        if (!isApiError(error)) throw error;
      }
    }
    return (
      reply
        .type("text/html; charset=utf-8")
        .header("cache-control", "no-store")
        // Своя страница: инлайн-скрипт перехода разрешён только ей.
        .header(
          "content-security-policy",
          "default-src 'none'; img-src *; script-src 'unsafe-inline'; base-uri 'none'",
        )
        .send(page(preview, deps.frontUrl, `${deps.publicShareUrl}/s/${code}`))
    );
  });
};
