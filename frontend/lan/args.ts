import { parseArgs } from "node:util";

export type LanArgs = { port: number; reset: boolean };

export const DEFAULT_PORT = 4000;

// Флаги `npm run lan -- --reset --port 4100` (TECH_SPEC §7a). Ошибка в
// флагах — понятный текст, а не стек.
export const parseLanArgs = (argv: string[]): LanArgs => {
  const { values } = parseArgs({
    args: argv,
    options: {
      port: { type: "string" },
      reset: { type: "boolean", default: false },
    },
    strict: true,
  });
  const port = values.port === undefined ? DEFAULT_PORT : Number(values.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `Порт должен быть числом от 1 до 65535, а не «${values.port}»`,
    );
  }
  return { port, reset: values.reset ?? false };
};
