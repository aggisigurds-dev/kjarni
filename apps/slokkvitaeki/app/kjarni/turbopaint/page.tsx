import type { Metadata } from "next";
import TurboPaintClient from "./TurboPaintClient";

export const metadata: Metadata = {
  title: "TurboPaint — gólfplan",
  description: "Teikniborð fyrir gólfplan — veggir, herbergi, hurðir og merkingar. Vistast í vafranum.",
};

export default function TurboPaintPage() {
  return <TurboPaintClient />;
}
