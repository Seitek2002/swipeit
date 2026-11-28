import { generateKeyPairSync, sign } from "node:crypto";
import { createServer } from "node:http";

import { TELEGRAM_ISSUER } from "../auth/telegram";

// Подставной Telegram для разработки (auto-tasks-pm-4 S03): проверить вход
// без настоящего бота. Только на этой машине: слушает 127.0.0.1, ключ живёт,
// пока запущен скрипт. В образ не попадает (build.mjs его не собирает), а
// сервер с TELEGRAM_JWKS_URL по умолчанию верит только ключам Telegram.
//
//   npm run telegram:dev -w backend [-- --port 4199 --client-id 1]
//
// Сервер — с теми же Client ID и адресом ключей:
//   TELEGRAM_CLIENT_ID=1 TELEGRAM_JWKS_URL=http://127.0.0.1:4199/jwks.json npm run dev -w backend
//
// id_token на выданный сервером nonce:
//   curl "http://127.0.0.1:4199/token?nonce=<nonce>&sub=alice"
if (process.env.NODE_ENV === "production") {
  console.error("telegram-dev — только для разработки");
  process.exit(2);
}

const args = process.argv.slice(2);
const valueOf = (flag: string) => {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
};
const port = Number(valueOf("--port") ?? 4199);
const clientId =
  valueOf("--client-id") ?? process.env.TELEGRAM_CLIENT_ID ?? "1";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const KID = "dev-1";
const jwks = {
  keys: [{ ...publicKey.export({ format: "jwk" }), kid: KID, alg: "RS256" }],
};

const b64 = (value: object) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

const idToken = (nonce: string, sub: string) => {
  const nowS = Math.floor(Date.now() / 1000);
  const header = b64({ alg: "RS256", kid: KID, typ: "JWT" });
  const payload = b64({
    iss: TELEGRAM_ISSUER,
    aud: clientId,
    sub,
    iat: nowS,
    exp: nowS + 600,
    nonce,
    name: `Dev ${sub}`,
  });
  const signature = sign(
    "sha256",
    Buffer.from(`${header}.${payload}`),
    privateKey,
  );
  return `${header}.${payload}.${signature.toString("base64url")}`;
};

createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  // Фронт на localhost:3000 берёт токен fetch'ем (подмена Telegram.Login в
  // консоли) — разрешаем любой адрес: сервер слушает только эту машину.
  response.setHeader("access-control-allow-origin", "*");
  if (url.pathname === "/jwks.json") {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(jwks));
    return;
  }
  const nonce = url.searchParams.get("nonce");
  if (url.pathname === "/token" && nonce) {
    response.setHeader("content-type", "text/plain; charset=utf-8");
    response.end(idToken(nonce, url.searchParams.get("sub") ?? "dev-user"));
    return;
  }
  response.statusCode = 404;
  response.end("GET /jwks.json или /token?nonce=…&sub=…");
}).listen(port, "127.0.0.1", () => {
  console.log(`Подставной Telegram: http://127.0.0.1:${port}`);
  console.log(
    `Сервер: TELEGRAM_CLIENT_ID=${clientId} TELEGRAM_JWKS_URL=http://127.0.0.1:${port}/jwks.json`,
  );
  console.log(
    `Токен: curl "http://127.0.0.1:${port}/token?nonce=<nonce>&sub=alice"`,
  );
});
