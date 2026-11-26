import { afterEach, describe, expect, it, vi } from "vitest";

// BASE_PATH читается при загрузке модуля — для каждого случая грузим заново.
const load = async (basePath: string | undefined) => {
  vi.resetModules();
  if (basePath === undefined) vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "");
  else vi.stubEnv("NEXT_PUBLIC_BASE_PATH", basePath);
  return import("./base-path");
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("withBasePath", () => {
  it("без basePath возвращает путь как есть", async () => {
    const { withBasePath } = await load(undefined);
    expect(withBasePath("/catalog/products.json")).toBe(
      "/catalog/products.json",
    );
  });

  it("добавляет /swipeit к своим файлам", async () => {
    const { withBasePath } = await load("/swipeit");
    expect(withBasePath("/catalog/products/p_0001/1.webp")).toBe(
      "/swipeit/catalog/products/p_0001/1.webp",
    );
    expect(withBasePath("/og.png")).toBe("/swipeit/og.png");
  });

  it("не добавляет basePath дважды", async () => {
    const { withBasePath } = await load("/swipeit");
    expect(withBasePath("/swipeit/og.png")).toBe("/swipeit/og.png");
    expect(withBasePath("/swipeit")).toBe("/swipeit");
  });

  it("не трогает внешние и относительные адреса", async () => {
    const { withBasePath } = await load("/swipeit");
    expect(withBasePath("https://ozon.ru/x")).toBe("https://ozon.ru/x");
    expect(withBasePath("//cdn.example.com/a.png")).toBe(
      "//cdn.example.com/a.png",
    );
    expect(withBasePath("data:image/png;base64,AA")).toBe(
      "data:image/png;base64,AA",
    );
    expect(withBasePath("img.png")).toBe("img.png");
  });

  it("путь, лишь начинающийся так же, получает basePath", async () => {
    const { withBasePath } = await load("/swipeit");
    expect(withBasePath("/swipeitx/a")).toBe("/swipeit/swipeitx/a");
  });
});
