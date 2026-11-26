// Режим работы (TECH_SPEC §6 «Определение режима при запуске»):
// local — «На этом устройстве», lan — «Локальная сеть».
export type ApiMode = "lan" | "local";

// Пока LAN-сервера нет, режим всегда local. Настоящее определение по
// GET /api/health с таймаутом 800 ms появится в T12b.
export const detectMode = async (): Promise<ApiMode> => "local";
