/* Gögn Stjórnstöðvarinnar — deilt milli klassíska útlitsins og Ragnarök. */

export const kr = (n: number) => Math.round(n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") + " kr";
export const MOD_COUNT = 9;

export type GItem = { icon: string; nafn: string; desc?: string; tag: string; ready: boolean; href?: string };
export const GALLERY: { group: string; sub: string; items: GItem[] }[] = [
  {
    group: "Kerfi-einingar", sub: "Rekstrareiningar sem kveikt er á þrepaskipt í þjónustukerfinu",
    items: [
      { icon: "👥", nafn: "Viðskiptavinir", desc: "Viðskiptavinaskrá", tag: "Kerfi", ready: true, href: "/kerfi" },
      { icon: "🧯", nafn: "Búnaður", desc: "Tæki, staðsetning, raðnr.", tag: "Kerfi", ready: true, href: "/kerfi" },
      { icon: "📋", nafn: "Skoðanir", desc: "Skoðunardagatal", tag: "Kerfi", ready: true, href: "/kerfi" },
      { icon: "🛒", nafn: "Sala (POS)", desc: "Afgreiðsluborð", tag: "Kerfi", ready: true, href: "/kerfi" },
      { icon: "🔧", nafn: "Verkstæði", desc: "Verkbeiðnir", tag: "Kerfi", ready: true, href: "/kerfi" },
      { icon: "📥", nafn: "Afgreiðsla", desc: "Móttaka/afhending", tag: "Kerfi", ready: true, href: "/kerfi" },
      { icon: "🏢", nafn: "Fyrirtæki í þjónustu", desc: "Þjónustusamningar", tag: "Kerfi", ready: true, href: "/kerfi" },
      { icon: "🚚", nafn: "Útkeyrsla", desc: "Leiðir + kort", tag: "Kerfi", ready: true, href: "/kerfi" },
      { icon: "🚨", nafn: "Brunakerfi", desc: "Viðvörunarkerfi", tag: "Kerfi", ready: false },
      { icon: "💳", nafn: "Reikningar & kröfur", desc: "Payday/kröfuyfirlit", tag: "Kerfi", ready: false },
    ],
  },
  {
    group: "Vef-blokkir", sub: "Byggingareiningar fyrir síður í síðuritlinum",
    items: [
      { icon: "⛰️", nafn: "Hetja", desc: "Fyrirsögn + hnappur", tag: "Vefur", ready: true, href: "/draft" },
      { icon: "📝", nafn: "Texti", desc: "Textablokk", tag: "Vefur", ready: true, href: "/draft" },
      { icon: "🛍️", nafn: "Vörur", desc: "Vöruúrval", tag: "Vefur", ready: true, href: "/draft" },
      { icon: "🖼️", nafn: "Mynd", desc: "Stök mynd", tag: "Vefur", ready: true, href: "/draft" },
      { icon: "🎞️", nafn: "Myndasafn", desc: "Fleiri myndir", tag: "Vefur", ready: true, href: "/draft" },
      { icon: "❓", nafn: "Spurt & svarað", desc: "FAQ", tag: "Vefur", ready: true, href: "/draft" },
      { icon: "📣", nafn: "Ákall", desc: "Call-to-action", tag: "Vefur", ready: true, href: "/draft" },
      { icon: "✉️", nafn: "Form", desc: "Hafa samband", tag: "Vefur", ready: true, href: "/draft" },
    ],
  },
  {
    group: "Tól & tengingar", sub: "Eiginleikar og tengingar sem má kveikja á",
    items: [
      { icon: "🛒", nafn: "Vefverslun", desc: "Karfa + kassi", tag: "Vefur", ready: true, href: "/verslun" },
      { icon: "📊", nafn: "Vefmælingar", desc: "Vercel Analytics", tag: "Verkfæri", ready: true, href: "/stjorn" },
      { icon: "📈", nafn: "Meta Pixel", desc: "FB/IG auglýsingar", tag: "Verkfæri", ready: true, href: "/stjorn" },
      { icon: "💬", nafn: "Netspjall", desc: "Tawk.to", tag: "Verkfæri", ready: true, href: "/stjorn" },
      { icon: "🗺️", nafn: "Kort", desc: "Leaflet + OSM", tag: "Kerfi", ready: true, href: "/kerfi" },
      { icon: "🔔", nafn: "Tilkynningaborði", desc: "Borði efst", tag: "Vefur", ready: true, href: "/stjorn" },
      { icon: "🗂️", nafn: "Skjalarinn", desc: "Skjöl · pdf · skrár", tag: "Tól", ready: true, href: "/skjalarinn" },
      { icon: "🧊", nafn: "3dwork", desc: "STL/mesh vinnustöð", tag: "Tól", ready: true, href: "/3dwork" },
      { icon: "🔖", nafn: "Marks", desc: "Whiteboard · möppur · covers", tag: "Tól", ready: true, href: "/marks" },
      { icon: "✎", nafn: "Prufusvæði", desc: "Blokkir · þemu · skikt", tag: "Tól", ready: true, href: "/draft" },
      { icon: "🖌️", nafn: "TurboPaint", desc: "Gólfplön — leita eftir heimilisfangi, svo teikning á borð", tag: "Tól", ready: true, href: "/kjarni/turbopaint" },
      { icon: "💳", nafn: "Payday", desc: "Reikningar", tag: "Verkfæri", ready: false },
      { icon: "📘", nafn: "Facebook", desc: "Tenging", tag: "Verkfæri", ready: false },
    ],
  },
];

export const QUICK_GROUPS: { title: string; items: { icon: string; label: string; href: string; ext?: boolean }[] }[] = [
  {
    title: "Kjarni",
    items: [
      { icon: "🏠", label: "Forsíða", href: "/" },
      { icon: "🎛️", label: "Stjórnborð", href: "/stjorn" },
      { icon: "🧩", label: "Kerfi", href: "/kerfi" },
      { icon: "🛒", label: "Verslun", href: "/verslun" },
      { icon: "🗂️", label: "Skjalarinn", href: "/skjalarinn" },
      { icon: "🧊", label: "3dwork", href: "/3dwork" },
      { icon: "🔖", label: "Marks", href: "/marks" },
      { icon: "✎", label: "Prufusvæði", href: "/draft" },
      { icon: "🖌️", label: "TurboPaint", href: "/kjarni/turbopaint" },
    ],
  },
  {
    title: "Öpp",
    items: [
      { icon: "🛠️", label: "Verkfæri", href: "https://verkfaeri.vercel.app", ext: true },
      { icon: "🧯", label: "Slökkvitæki", href: "https://slokkvitaeki.netlify.app", ext: true },
      { icon: "🔥", label: "Brunahólf", href: "https://brunaholf.netlify.app", ext: true },
    ],
  },
  {
    title: "Þróun",
    items: [
      { icon: "💻", label: "GitHub", href: "https://github.com/aggisigurds-dev/kjarni", ext: true },
      { icon: "▲", label: "Vercel", href: "https://vercel.com/kjarni", ext: true },
    ],
  },
];
export const CONNS: { icon: string; nafn: string; status: string; on: boolean; how: string; cta: string; href: string }[] = [
  { icon: "🌐", nafn: "Tengja lén", status: "Ekki tengt", on: false, how: "Bættu léninu þínu við verkefnið í Vercel og vísaðu DNS-færslu (CNAME) á cname.vercel-dns.com. Vefurinn birtist þá á þínu eigin léni.", cta: "Opna Vercel Domains", href: "https://vercel.com/kjarni/slokkvitaeki/settings/domains" },
  { icon: "💳", nafn: "Payday", status: "Ekki tengt", on: false, how: "Sæktu API Client ID + Secret í Payday (Stillingar → API) og límdu í Verkfæri. Þá má sækja reikninga og senda kröfur beint úr kerfinu.", cta: "Opna Payday", href: "https://att.payday.is" },
  { icon: "✉️", nafn: "Gmail", status: "Ekki tengt", on: false, how: "Tengdu Google-reikning gegnum OAuth til að lesa og senda tölvupóst úr kerfinu (t.d. fyrirspurnir og kröfur). Bætist við sem tól.", cta: "Google Cloud", href: "https://console.cloud.google.com" },
  { icon: "📘", nafn: "Facebook / Meta", status: "Pixel til", on: true, how: "Límdu Meta Pixel auðkenni í Verkfæri fyrir auglýsingamælingar. Full Facebook-síðutenging kemur í Þrep 3.", cta: "Opna Verkfæri", href: "/stjorn" },
];

