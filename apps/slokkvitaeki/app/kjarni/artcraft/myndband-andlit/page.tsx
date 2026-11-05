import MyndbandAndlitClient from "./MyndbandAndlitClient";

export const metadata = {
  title: "Myndband-andlit — Kjarni",
  description: "Setja eitt andlit á allt myndband (frame-fyrir-frame) með roop_face_swap á Replicate.",
};

export default function Page() {
  return <MyndbandAndlitClient />;
}
