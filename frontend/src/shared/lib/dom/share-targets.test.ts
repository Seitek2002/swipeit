import { describe, expect, it } from "vitest";

import { absoluteUrl } from "./share-targets";

describe("absoluteUrl", () => {
  it("полный адрес (короткая ссылка сервера) — как есть", () => {
    expect(absoluteUrl("https://swipeit.example/s/AbCdEf1234")).toBe(
      "https://swipeit.example/s/AbCdEf1234",
    );
  });
});
