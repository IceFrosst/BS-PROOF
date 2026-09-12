import { notFound } from "next/navigation";
import AbPrototype from "./prototype";

export const dynamic = "force-dynamic";
export const metadata = { title: "Result card A/B · Design lab" };

export default function AbPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <AbPrototype />;
}
