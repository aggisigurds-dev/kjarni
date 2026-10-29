import type { Metadata } from "next";
import VaknaClient from "./VaknaClient";

export const metadata: Metadata = {
  title: "Vakna — Kjarni",
  description:
    "Wan 2.2 TI2V á okkar eigin RunPod Serverless endpoint: mynd + lýsing á hreyfingu → stutt myndband. Scales to zero, engin NSFW-takmörk.",
};

export default function VaknaPage() {
  return <VaknaClient />;
}
