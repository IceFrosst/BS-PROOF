import { notFound } from "next/navigation";
import MobilePrototype from "./prototype";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pocket research · Mobile design lab" };

export default function MobileDesignPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <MobilePrototype />;
}
