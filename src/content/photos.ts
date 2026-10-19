/**
 * Archival photographs on the landing page, from Wikimedia Commons. Every one
 * is credited in the site footer. Source records: public/home/credits.json.
 */
export type Photo = {
  src: string;
  width: number;
  height: number;
  alt: string;
  caption: string;
  credit: string;
  licence: string;
  page: string;
};

export const photos = {
  exchangeHall: {
    src: "/home/exchange-hall-1905.jpg",
    width: 1920,
    height: 1279,
    alt: "A long arched hall of a telephone exchange, with rows of operators seated at switchboards along both walls.",
    caption: "A telephone exchange in 1905. Every call was connected by hand, one operator per seat, more seats for more calls.",
    credit: "Kempster B. Miller, American Telephone Practice (1905)",
    licence: "No known copyright restrictions",
    page: "https://commons.wikimedia.org/wiki/File:American_telephone_practice_(1905)_(14756285825).jpg",
  },
  operator: {
    src: "/home/operator-1943.jpg",
    width: 1920,
    height: 1691,
    alt: "A switchboard operator wearing a headset, plugging a cord into a board covered in numbered jacks.",
    caption: "A Bell System operator, 1943.",
    credit: "Bell Telephone Magazine (1943), via Internet Archive Book Images",
    licence: "No known copyright restrictions",
    page: "https://commons.wikimedia.org/wiki/File:Bell_telephone_magazine_(1943)_(14569958148).jpg",
  },
  wacOperators: {
    src: "/home/wac-operators.jpg",
    width: 1920,
    height: 1476,
    alt: "A row of women in uniform with headsets working at a long wartime switchboard.",
    caption: "Women's Army Corps operators at a field exchange, 1944.",
    credit: "PhotosNormandie",
    licence: "CC BY-SA 2.0",
    page: "https://commons.wikimedia.org/w/index.php?curid=131249837",
  },
  fieldSwitchboard: {
    src: "/home/field-switchboard-1942.jpg",
    width: 1920,
    height: 1453,
    alt: "A Marine with a headset at a field switchboard dug into rock, with bundles of cable running into the board.",
    caption: "A field switchboard on Guadalcanal, about 1942.",
    credit: "Archives Branch, USMC History Division",
    licence: "CC BY 2.0",
    page: "https://commons.wikimedia.org/w/index.php?curid=109890737",
  },
} satisfies Record<string, Photo>;

/** A silent loop cut from a 1947 Polygoon newsreel about Arnhem's automatic exchange. */
export const selectorClip = {
  mp4: "/home/selector-1947.mp4",
  webm: "/home/selector-1947.webm",
  poster: "/home/selector-1947.jpg",
  width: 768,
  height: 576,
  caption: "Selector switches in Arnhem's automatic exchange, 1947. Machines took over the routing.",
  credit: "Polygoon Hollands Nieuws, Netherlands Institute for Sound and Vision",
  licence: "Public domain",
  page: "https://commons.wikimedia.org/wiki/File:ARNHEM_KAN_WEER_AUTOMATISCH_TELEFONEREN-PGM4011942.webm",
};
