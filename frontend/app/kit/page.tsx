import { notFound } from "next/navigation";

import { KitPage } from "@/pages/kit";

// Витрина компонентов — только в режиме разработки (TECH_SPEC §10).
export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <KitPage />;
}
