import MyndbandPortretAndlitClient from "./MyndbandPortretAndlitClient";

export const metadata = {
  title: "Myndband-portret-andlit — Kjarni",
  description:
    "Portret-crop + face-swap á crop-svæðinu + composite aftur í myndbandið. Minni filter-off þörf.",
};

export default function Page() {
  return <MyndbandPortretAndlitClient />;
}
