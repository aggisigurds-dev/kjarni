import { redirect } from "next/navigation";

// Tónklippa er sjálfstætt app á /tonklippa (má setja á heimaskjá í síma);
// ArtCraft-færslan vísar þangað.
export default function TonklippaArtcraftPage() {
  redirect("/tonklippa");
}
