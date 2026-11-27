import { type BotEngineDeps, createBotEngine } from "./engine";
import { plansBehavior } from "./plans";
import { santaBehavior } from "./santa";
import { wishlistBehavior } from "./wishlist";

export {
  type BotApi,
  type BotBehavior,
  type BotEngine,
  type BotScheduler,
  createBotEngine,
} from "./engine";

export const BOT_BEHAVIORS = [wishlistBehavior, plansBehavior, santaBehavior];

// Движок со всеми поведениями — для вкладки-лидера (local) и LAN-сервера.
export const createDefaultBotEngine = (
  deps: Omit<BotEngineDeps, "behaviors">,
) => createBotEngine({ ...deps, behaviors: BOT_BEHAVIORS });
