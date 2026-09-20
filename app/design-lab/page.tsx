import { notFound } from "next/navigation";
import DesignLab from "./prototype";

export const dynamic = "force-dynamic";
export const metadata = { title: "Launch design lab" };

export default function DesignLabPage() {
  if (process.env.NODE_ENV !== "development" && process.env.DESIGN_LAB !== "1") notFound();
  return <DesignLab />;
}
