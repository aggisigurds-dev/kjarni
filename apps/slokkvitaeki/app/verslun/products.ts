// Trial catalogue — pulled from the Slökkvitæki POS "Vörur" list.
// Prices in ISK: `price` is með vsk (24%), `priceNoVsk` is án vsk. `stock` 0 = uppselt.

export type Category = {
  id: string;
  label: string;
  icon: string;
  tint: string;
};

export const CATEGORIES: Category[] = [
  { id: "slokkvitaeki", label: "Slökkvitæki", icon: "🧯", tint: "#fdecec" },
  { id: "slongur", label: "Slöngur & skápar", icon: "🧰", tint: "#eaf1fb" },
  { id: "teppi", label: "Eldvarnarteppi", icon: "🟥", tint: "#fff1e6" },
  { id: "skynjarar", label: "Skynjarar", icon: "🚨", tint: "#f2edfb" },
  { id: "sjukra", label: "Sjúkrabúnaður", icon: "🩹", tint: "#e8f8ef" },
  { id: "fylgihlutir", label: "Fylgihlutir", icon: "🔧", tint: "#eef1f4" },
];

export type Product = {
  id: string;
  name: string;
  price: number;
  priceNoVsk: number;
  stock: number;
  category: string;
};

export const PRODUCTS: Product[] = [
  { id: "duft2", name: "Duft 2 kg. ABC Slökkvitæki", price: 8500, priceNoVsk: 6855, stock: 376, category: "slokkvitaeki" },
  { id: "duft6", name: "Duft 6 kg. ABC Slökkvitæki", price: 13500, priceNoVsk: 10887, stock: 218, category: "slokkvitaeki" },
  { id: "co2-2", name: "CO₂ 2 kg. Slökkvitæki", price: 16500, priceNoVsk: 13306, stock: 44, category: "slokkvitaeki" },
  { id: "co2-5", name: "CO₂ 5 kg. Slökkvitæki", price: 29500, priceNoVsk: 23790, stock: 0, category: "slokkvitaeki" },
  { id: "lettvatn2", name: "Léttvatn 2 kg. AB Slökkvitæki", price: 11500, priceNoVsk: 9274, stock: 10, category: "slokkvitaeki" },
  { id: "lettvatn6", name: "Léttvatn 6 kg. AB Slökkvitæki", price: 14500, priceNoVsk: 11694, stock: 308, category: "slokkvitaeki" },
  { id: "abf6", name: "ABF 6 l. Slökkvitæki", price: 29500, priceNoVsk: 23790, stock: 0, category: "slokkvitaeki" },
  { id: "co2-1", name: "CO₂ 1 kg. Slökkvitæki", price: 1215, priceNoVsk: 980, stock: 10000, category: "slokkvitaeki" },
  { id: "notadir-co2", name: "Notaðir 5 kg CO₂ kútar", price: 14500, priceNoVsk: 11694, stock: 0, category: "slokkvitaeki" },
  { id: "notadir-kutar", name: "Notaðir kútar / tæki", price: 1000, priceNoVsk: 806, stock: 30, category: "slokkvitaeki" },

  { id: "brunaslanga", name: "Brunaslanga", price: 74400, priceNoVsk: 60000, stock: 10, category: "slongur" },
  { id: "skapur", name: "Slökkvitækjaskápur", price: 19500, priceNoVsk: 15726, stock: 10, category: "slongur" },
  { id: "stutur", name: "Brunaslöngustútur 1\"", price: 10540, priceNoVsk: 8500, stock: 0, category: "slongur" },
  { id: "krani", name: "Krani slökkvitæki", price: 3300, priceNoVsk: 2661, stock: 30, category: "slongur" },

  { id: "teppi-cws", name: "Eldvarnarteppi CWS hvítt", price: 4990, priceNoVsk: 4024, stock: 0, category: "teppi" },
  { id: "teppi-12", name: "Eldvarnarteppi 1,2m x 1,2m", price: 4328, priceNoVsk: 3490, stock: 18, category: "teppi" },

  { id: "reyk1", name: "Reykskynjari", price: 4490, priceNoVsk: 3621, stock: 25, category: "skynjarar" },
  { id: "reyk2", name: "Reykskynjari 2", price: 2722, priceNoVsk: 2195, stock: 30, category: "skynjarar" },
  { id: "reyk3", name: "Reykskynjari 3", price: 6650, priceNoVsk: 5363, stock: 30, category: "skynjarar" },
  { id: "gas-kidde", name: "Gasskynjari Battery Kidde", price: 5990, priceNoVsk: 4831, stock: 9, category: "skynjarar" },
  { id: "gas-zorro", name: "Gasskynjari Zorro 230V", price: 5990, priceNoVsk: 4831, stock: 1, category: "skynjarar" },

  { id: "ningbo", name: "Ningbo sjúkrataska rauð", price: 1995, priceNoVsk: 1609, stock: 5, category: "sjukra" },
  { id: "sjukrakassi", name: "Sjúkrakassi hvítur m/veggf. Spencer", price: 19950, priceNoVsk: 16089, stock: 2, category: "sjukra" },
  { id: "firstaid", name: "Sjúkrataska First Aid Combi", price: 28350, priceNoVsk: 22863, stock: 1, category: "sjukra" },

  { id: "skipafesting", name: "Skipafesting 5/6/12 kg svört", price: 7990, priceNoVsk: 6444, stock: 10, category: "fylgihlutir" },
  { id: "co2-byrjun", name: "CO₂ byrjunargjald", price: 1240, priceNoVsk: 1000, stock: 0, category: "fylgihlutir" },
];
