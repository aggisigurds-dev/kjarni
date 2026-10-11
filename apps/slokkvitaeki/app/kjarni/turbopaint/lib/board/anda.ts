/**
 * Hleypir vafranum að (framvindustika, smellir) á milli þungra skrefa.
 *
 * MessageChannel — ekki setTimeout(0): í FÖLDUM flipa hægir vafrinn á keðju tímastilla, fyrst í eina keyrslu á sekúndu
 * og eftir 5 mínútur í eina á MÍNÚTU. Biðröðin „Veggjavél · N" keyrir einmitt í flipa sem notandinn horfir ekki á —
 * Dalshraun 1 (11.10.2026): 9 mínútur frá svari Veggjavélarinnar að vistun hæðarinnar. Skilaboð um MessageChannel eru
 * ekki tímastillar og hægjast ekki (React notar sömu leið í tímaáætlun sinni). Án MessageChannel: setTimeout.
 */
export function anda(): Promise<void> {
  if (typeof MessageChannel === "undefined") return new Promise<void>((r) => setTimeout(r, 0));
  return new Promise<void>((r) => {
    const c = new MessageChannel();
    c.port1.onmessage = () => {
      c.port1.close();
      r();
    };
    c.port2.postMessage(0);
  });
}
