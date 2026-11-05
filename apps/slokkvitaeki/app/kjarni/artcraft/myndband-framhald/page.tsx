import MyndbandFramhaldClient from "./MyndbandFramhaldClient";

export const metadata = {
  title: "Myndband-framhald — Kjarni",
  description: "Teygja myndband með því að búa til framhald út frá síðasta frame-i gegnum Wan 2.2 i2v.",
};

export default function Page() {
  return <MyndbandFramhaldClient />;
}
