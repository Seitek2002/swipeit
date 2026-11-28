import { ClientFunnelInputSchema } from "@swipeit/core/api/funnel";
import { parseInput } from "@swipeit/core/parse-input";

import type { ServerHandler } from "../../context";
import { readMe } from "../users/queries";
import { reachStep } from "./steps";

// POST /me/funnel { step } — шаг, который видит только клиент (R09): один раз
// на человека, по тем же правилам (свой профиль команды не считается).
// Подробностей вроде User-Agent не храним.
export const reachClientStep: ServerHandler = async (ctx, { body }) => {
  const { step } = parseInput(ClientFunnelInputSchema, body);
  const me = await readMe(ctx);
  await reachStep(ctx.tx, me.id, step, ctx.clock.now());
  return { ok: true };
};
