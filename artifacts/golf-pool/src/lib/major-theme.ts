// Per-major color identity, echoing the pool's original spreadsheets (green
// Masters banner, blue US Open, claret British Open, teal PGA). `primary` is an
// HSL triple that overrides the app-wide --primary var inside a themed page, so
// accents (totals, badges, buttons) pick up the event's color automatically.

export interface MajorTheme {
  key: string;
  banner: string; // CSS background for the title banner
  bannerText: string; // title text color on the banner
  primary: string; // HSL triple for --primary
  dot: string; // small solid accent (history page markers)
}

const THEMES: { pattern: RegExp; theme: MajorTheme }[] = [
  {
    pattern: /masters/i,
    theme: {
      key: "masters",
      banner: "linear-gradient(135deg, #0b5d1e 0%, #0a4517 100%)",
      bannerText: "#f5d547",
      primary: "48 90% 55%", // Augusta gold
      dot: "#0b5d1e",
    },
  },
  {
    pattern: /pga\s*champ|pga$|^pga\b/i,
    theme: {
      key: "pga",
      banner: "linear-gradient(135deg, #0e4d5c 0%, #092f3a 100%)",
      bannerText: "#ffd766",
      primary: "45 95% 58%",
      dot: "#0e4d5c",
    },
  },
  {
    pattern: /u\.?\s*s\.?\s*open|us open/i,
    theme: {
      key: "us-open",
      banner: "linear-gradient(135deg, #1e56c8 0%, #123a8c 100%)",
      bannerText: "#ffffff",
      primary: "217 85% 65%",
      dot: "#1e56c8",
    },
  },
  {
    pattern: /british|the open|open champ/i,
    theme: {
      key: "british-open",
      banner: "linear-gradient(135deg, #8f1d2c 0%, #641020 100%)",
      bannerText: "#ffd98f",
      primary: "36 90% 58%", // Claret Jug gold
      dot: "#8f1d2c",
    },
  },
];

const DEFAULT_THEME: MajorTheme = {
  key: "default",
  banner: "linear-gradient(135deg, #163a2c 0%, #0d241b 100%)",
  bannerText: "hsl(43 85% 52%)",
  primary: "43 85% 52%", // the app's stock gold
  dot: "#163a2c",
};

export function majorTheme(name: string | null | undefined): MajorTheme {
  if (name) {
    for (const { pattern, theme } of THEMES) {
      if (pattern.test(name)) return theme;
    }
  }
  return DEFAULT_THEME;
}
