import { redirect } from "next/navigation";

// Tónklippa er hluti af THE COACH, sjálfstæðu appi á /coach (má setja á
// heimaskjá í síma); ArtCraft-færslan vísar þangað.
export default function TonklippaArtcraftPage() {
  redirect("/coach");
}
