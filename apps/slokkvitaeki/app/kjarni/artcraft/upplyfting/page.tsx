import type { Metadata } from "next";
import UpplyftingClient from "./UpplyftingClient";

export const metadata: Metadata = {
  title: "Upplyfting — Kjarni",
  description: "Faglegt myndupplyfting með Topaz Labs á Replicate — stækkar og skerpir mynd án þess að breyta efni.",
};

export default function UpplyftingPage() {
  return <UpplyftingClient />;
}
