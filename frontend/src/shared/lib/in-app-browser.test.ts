import { describe, expect, it } from "vitest";

import { detectInAppBrowser, inAppJoinText } from "./in-app-browser";

describe("detectInAppBrowser (Q08)", () => {
  it("узнаёт Telegram Android, Instagram iOS и Facebook", () => {
    expect(
      detectInAppBrowser(
        "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.6778.135 Mobile Safari/537.36 Telegram-Android/11.5.3 (Google Pixel 8; Android 14; SDK 34; AVERAGE)",
      ),
    ).toBe("telegram");
    expect(
      detectInAppBrowser(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 339.0.3.12.91 (iPhone15,2; iOS 17_5; ru_RU; ru; scale=3.00; 1179x2556; 621013488)",
      ),
    ).toBe("instagram");
    expect(
      detectInAppBrowser(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0.0.43.109;FBBV/612345678]",
      ),
    ).toBe("facebook");
  });

  it("обычные браузеры и пустая строка — null", () => {
    expect(
      detectInAppBrowser(
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
      ),
    ).toBeNull();
    expect(
      detectInAppBrowser(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
      ),
    ).toBeNull();
    expect(detectInAppBrowser("")).toBeNull();
  });
});

describe("inAppJoinText (R04)", () => {
  it("игра и план — свой текст с названием браузера", () => {
    expect(inAppJoinText("telegram", "santa")).toBe(
      "Ты в браузере Telegram — игра сохранится только здесь. Чтобы открывать её из Chrome, скопируй ссылку и вступи там",
    );
    expect(inAppJoinText("instagram", "plan")).toBe(
      "Ты в браузере Instagram — план сохранится только здесь. Чтобы открывать его из Chrome, скопируй ссылку и вступи там",
    );
  });
});
