export type DeskMode = "split" | "buyback" | "raid";

export type CrewMember = {
  handle: string;
  share: number;
};

export type LaunchDraft = {
  name: string;
  ticker: string;
  vibe: string;
  mode: DeskMode;
  crew: CrewMember[];
  initialBuySol: number;
};

export type TapeItem = {
  id: string;
  text: string;
};

export type FeedItem = {
  id: string;
  time: string;
  title: string;
  detail: string;
  amount: string;
};

export const DESK_MODES: {
  id: DeskMode
  label: string
  short: string
  blurb: string
}[] = [
  {
    id: "split",
    label: "Fee Split",
    short: "Split",
    blurb: "Creator fees route to tagged X accounts.",
  },
  {
    id: "buyback",
    label: "Dip Buyback",
    short: "Buyback",
    blurb: "Crew share buys dips when rules fire.",
  },
  {
    id: "raid",
    label: "Raid Pool",
    short: "Raid",
    blurb: "Fees fund a public raid pot for posters.",
  },
];

export const TAPE: TapeItem[] = [
  { id: "1", text: "paid @solana · 0.073 SOL from $X-CAT" },
  { id: "2", text: "$COLA desk remitted 0.18 KOX to @cocacola" },
  { id: "3", text: "crew wake · $E/ACC fees live on the tape" },
  { id: "4", text: "buyback armed · floor rule under $40k" },
  { id: "5", text: "raid pot topped · 1.2 SOL for holders who post" },
  { id: "6", text: "0% platform cut · 100% to named crew" },
  { id: "7", text: "new launch queued · 4 X recipients locked" },
  { id: "8", text: "Pump create + fee route in one click" },
];

export const FEED: FeedItem[] = [
  {
    id: "f1",
    time: "12s",
    title: "$XDCAT → @solana",
    detail: "Creator fee claim settled. Desk posted payout receipt to the board.",
    amount: "+0.396 SOL",
  },
  {
    id: "f2",
    time: "2m",
    title: "$E/ACC crew split",
    detail: "@beffjezos took 100%. Tape marked paid on X Money rail (demo).",
    amount: "+0.181 SOL",
  },
  {
    id: "f3",
    time: "5m",
    title: "$BATON raid pool",
    detail: "Equal cut to @pumpfun @a1lon9 @outdoteth @sapijiju.",
    amount: "+448 PUMP",
  },
  {
    id: "f4",
    time: "11m",
    title: "Desk thought · $MNGO",
    detail: "Volume cooled. Holding reserve. Next claim after 0.05 SOL accrued.",
    amount: "HOLD",
  },
  {
    id: "f5",
    time: "18m",
    title: "$X-DOG → @bigdavesolan",
    detail: "Single-recipient crew. No platform skim. Receipt hashed on board.",
    amount: "+0.045 SOL",
  },
];

export const DEFAULT_DRAFT: LaunchDraft = {
  name: "Desk Cat",
  ticker: "DCAT",
  vibe: "A trading-floor cat that tips the people who make the chart move.",
  mode: "split",
  crew: [
    { handle: "@yourhandle", share: 70 },
    { handle: "@kolfriend", share: 30 },
  ],
  initialBuySol: 0.1,
};

export function totalShare(crew: CrewMember[]) {
  return crew.reduce((sum, member) => sum + (Number(member.share) || 0), 0);
}

export function normalizeTicker(value: string) {
  return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 10);
}
