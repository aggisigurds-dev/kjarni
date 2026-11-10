import { redirect } from "next/navigation";

// Appið heitir THE COACH og býr á /coach; gamla slóðin vísar þangað.
export default function TonklippaRedirect() {
  redirect("/coach");
}
