// Trial catalogue — pulled from the Brunahólf Slökkvitæki ehf POS "Vörur" list.
// Prices in ISK: `price` is með vsk (24%), `priceNoVsk` is án vsk. `stock` 0 = uppselt.
// `img` points to a real product photo extracted from the app (public/vorur/*).
// `eldflokkur` = fire classes the item covers (subset of A/B/C/F); "" for
// accessories/detectors that have no class. A=föst efni, B=vökvar, C=gas, F=matarolía.

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

// Fire-class legend for the Eldflokkur filter.
export const ELDFLOKKAR: { k: string; label: string }[] = [
  { k: "A", label: "föst efni" },
  { k: "B", label: "vökvar" },
  { k: "C", label: "gas" },
  { k: "F", label: "matarolía" },
];

export type Product = {
  id: string;
  name: string;
  price: number;
  priceNoVsk: number;
  stock: number;
  category: string;
  eldflokkur: string;
  img?: string;
};

export const PRODUCTS: Product[] = [
  { id: "duft2", name: "Duft 2 kg. ABC Slökkvitæki", price: 8500, priceNoVsk: 6855, stock: 376, category: "slokkvitaeki", eldflokkur: "ABC", img: "/vorur/12.jpg" },
  { id: "duft6", name: "Duft 6 kg. ABC Slökkvitæki", price: 13500, priceNoVsk: 10887, stock: 218, category: "slokkvitaeki", eldflokkur: "ABC", img: "/vorur/1.jpg" },
  { id: "co2-2", name: "CO₂ 2 kg. Slökkvitæki", price: 16500, priceNoVsk: 13306, stock: 44, category: "slokkvitaeki", eldflokkur: "BC", img: "/vorur/2.jpg" },
  { id: "co2-5", name: "CO₂ 5 kg. Slökkvitæki", price: 29500, priceNoVsk: 23790, stock: 0, category: "slokkvitaeki", eldflokkur: "BC", img: "/vorur/25.jpg" },
  { id: "lettvatn2", name: "Léttvatn 2 kg. AB Slökkvitæki", price: 11500, priceNoVsk: 9274, stock: 10, category: "slokkvitaeki", eldflokkur: "AB", img: "/vorur/174.jpg" },
  { id: "lettvatn6", name: "Léttvatn 6 kg. AB Slökkvitæki", price: 14500, priceNoVsk: 11694, stock: 308, category: "slokkvitaeki", eldflokkur: "AB", img: "/vorur/18.jpg" },
  { id: "abf6", name: "ABF 6 l. Slökkvitæki", price: 29500, priceNoVsk: 23790, stock: 0, category: "slokkvitaeki", eldflokkur: "ABF", img: "/vorur/24.jpg" },
  { id: "co2-1", name: "CO₂ 1 kg. Slökkvitæki", price: 1215, priceNoVsk: 980, stock: 10000, category: "slokkvitaeki", eldflokkur: "BC" },
  { id: "notadir-co2", name: "Notaðir 5 kg CO₂ kútar", price: 14500, priceNoVsk: 11694, stock: 0, category: "slokkvitaeki", eldflokkur: "BC" },
  { id: "notadir-kutar", name: "Notaðir kútar / tæki", price: 1000, priceNoVsk: 806, stock: 30, category: "slokkvitaeki", eldflokkur: "ABC" },

  { id: "brunaslanga", name: "Brunaslanga", price: 74400, priceNoVsk: 60000, stock: 10, category: "slongur", eldflokkur: "A", img: "/vorur/16.jpg" },
  { id: "skapur", name: "Slökkvitækjaskápur", price: 19500, priceNoVsk: 15726, stock: 10, category: "slongur", eldflokkur: "", img: "/vorur/17.jpg" },
  { id: "stutur", name: "Brunaslöngustútur 1\"", price: 10540, priceNoVsk: 8500, stock: 0, category: "slongur", eldflokkur: "" },
  { id: "krani", name: "Krani slökkvitæki", price: 3300, priceNoVsk: 2661, stock: 30, category: "slongur", eldflokkur: "" },

  { id: "teppi-cws", name: "Eldvarnarteppi CWS hvítt", price: 4990, priceNoVsk: 4024, stock: 0, category: "teppi", eldflokkur: "F", img: "/vorur/340.png" },
  { id: "teppi-12", name: "Eldvarnarteppi 1,2m x 1,2m", price: 4328, priceNoVsk: 3490, stock: 18, category: "teppi", eldflokkur: "F", img: "/vorur/4.jpg" },

  { id: "reyk1", name: "Reykskynjari", price: 4490, priceNoVsk: 3621, stock: 25, category: "skynjarar", eldflokkur: "", img: "/vorur/3.jpg" },
  { id: "reyk2", name: "Reykskynjari 2", price: 2722, priceNoVsk: 2195, stock: 30, category: "skynjarar", eldflokkur: "", img: "/vorur/13.jpg" },
  { id: "reyk3", name: "Reykskynjari 3", price: 6650, priceNoVsk: 5363, stock: 30, category: "skynjarar", eldflokkur: "", img: "/vorur/14.jpg" },
  { id: "gas-kidde", name: "Gasskynjari Battery Kidde", price: 5990, priceNoVsk: 4831, stock: 9, category: "skynjarar", eldflokkur: "", img: "/vorur/342.jpg" },
  { id: "gas-zorro", name: "Gasskynjari Zorro 230V", price: 5990, priceNoVsk: 4831, stock: 1, category: "skynjarar", eldflokkur: "", img: "/vorur/195.jpg" },

  { id: "ningbo", name: "Ningbo sjúkrataska rauð", price: 1995, priceNoVsk: 1609, stock: 5, category: "sjukra", eldflokkur: "", img: "/vorur/339.jpg" },
  { id: "sjukrakassi", name: "Sjúkrakassi hvítur m/veggf. Spencer", price: 19950, priceNoVsk: 16089, stock: 2, category: "sjukra", eldflokkur: "", img: "/vorur/338.png" },
  { id: "firstaid", name: "Sjúkrataska First Aid Combi", price: 28350, priceNoVsk: 22863, stock: 1, category: "sjukra", eldflokkur: "", img: "/vorur/337.png" },

  { id: "skipafesting", name: "Skipafesting 5/6/12 kg svört", price: 7990, priceNoVsk: 6444, stock: 10, category: "fylgihlutir", eldflokkur: "", img: "/vorur/341.jpg" },
  { id: "co2-byrjun", name: "CO₂ byrjunargjald", price: 1240, priceNoVsk: 1000, stock: 0, category: "fylgihlutir", eldflokkur: "" },
];
