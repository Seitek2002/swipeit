// Проверка WebSocket через контейнер web (deploy-smoke в CI, S02): hello с
// токеном → сервер отвечает ready. Node 22+ — WebSocket встроен.
//   node backend/deploy/ci/ws-hello.mjs ws://localhost:8080/v1/ws <токен>
const [url, token] = process.argv.slice(2);
if (!url || !token) {
  console.error("Использование: node ws-hello.mjs <ws://…/v1/ws> <токен>");
  process.exit(2);
}

const socket = new WebSocket(url);
const timer = setTimeout(() => {
  console.error("Нет ready за 10 секунд");
  process.exit(1);
}, 10_000);

socket.addEventListener("open", () => {
  socket.send(JSON.stringify({ type: "hello", token }));
});
socket.addEventListener("message", (event) => {
  const message = JSON.parse(String(event.data));
  console.log("ws:", message.type);
  if (message.type === "ready") {
    clearTimeout(timer);
    socket.close();
    console.log("WebSocket через web: hello → ready");
    process.exit(0);
  }
});
socket.addEventListener("close", (event) => {
  console.error(`Соединение закрыто: ${event.code} ${event.reason}`);
  process.exit(1);
});
socket.addEventListener("error", () => {
  console.error("Ошибка WebSocket");
  process.exit(1);
});
