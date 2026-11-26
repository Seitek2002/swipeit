// Тактильный отклик. Vibration API есть в Android Chrome и WebView; в Safari и
// WKWebView на iOS его нет и не будет (выбор Apple) — там вызов ничего не
// делает. DESIGN.md §6: 8ms на пороге свайпа, 15ms при улетании карточки.
export const vibrate = (ms: number) => {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(ms);
    }
  } catch {
    // Браузер может запретить вибрацию без жеста пользователя — это не ошибка.
  }
};
