// valmak — keyboard layout source. keyboard.js parses this at runtime.
//
// Grid: `left || right`, space-separated tokens. `_` is "no key" (BASE)
// or "passthrough" (overlays). Multi-char tokens are fine; GLYPHS-table
// names (shift, ctrl, ret, bksp, …) render as glyphs.
//
// layers[0] is BASE; rest are overlays drawing from --color-layer-N
// slots in order. A layer is trigger-activated if some `modifiers`
// entry names it, otherwise button-driven. surfaceModifiers: false →
// delta-style overlay (unmapped modifiers fade too).

export default {
  layers: [
    {
      name: "base",
      grid: `
  q w f p b || = u o y j
x n l s t g || - e a i h k
  z m c d v || / ; , . '
      r ret || bksp space
`,
    },
    {
      name: "nav",
      grid: `
        esc home up pgup ins ||
caps tab left down right del ||
                end _ pgdn _ ||
`,
    },
    {
      name: "num",
      grid: `
|| _ 7 8 9
|| [ 1 2 3 0 ]
|| \\ 4 5 6 \`
`,
    },
    {
      // delta-style: only positions that differ from base
      name: "Colemak-DH",
      surfaceModifiers: false,
      grid: `
          || j l u _ ;
a r _ _ _ || m n e _ o
  x _ _ _ || k h _ _ /
`,
    },
  ],

  // SVG a11y
  title: "valmak keyboard layout",
  description:
    "Thumb-alpha keyboard layout on a 36-key totem split, two halves each " +
    "with 3 rows of 5 keys, one extra outer pinky letter on the home row, " +
    "and 2 thumb keys.",

  // Hold actions, keyed by base letter. Value = layer name (→ trigger),
  // "shift", or any GLYPHS name (→ glyph on hold).
  modifiers: {
    t: "ctrl", s: "alt", l: "win",
    e: "ctrl", a: "alt", i: "win",
    ret: "nav", r: "shift",
    bksp: "num", space: "shift",
  },

  // Draw shift+adjacent-letter combo bars; hover activates both.
  comboShifts: true,

  // Used by both shift preview and combo-bar overlay.
  shifted: {
    a: "A", b: "B", c: "C", d: "D", e: "E", f: "F", g: "G",
    h: "H", i: "I", j: "J", k: "K", l: "L", m: "M", n: "N",
    o: "O", p: "P", q: "Q", r: "R", s: "S", t: "T", u: "U",
    v: "V", w: "W", x: "X", y: "Y", z: "Z",
    "=": "+", "-": "_", "/": "?", ";": ":", ",": "<", ".": ">", "'": '"',
    "0": ")", "1": "!", "2": "@", "3": "#", "4": "$",
    "5": "%", "6": "^", "7": "&", "8": "*", "9": "(",
    "[": "{", "]": "}", "\\": "|", "`": "~",
  },

  // `compare` button activates the matching layer by name.
  controls: {
    modifiers: "Modifiers",
    compare: "Colemak-DH",
  },

  // Rendered left-to-right in declaration order.
  links: [
    {
      label: "Oryx",
      href: "https://configure.zsa.io/moonlander/layouts/5wLre/latest/0",
    },
    {
      label: "Metrics",
      href: "https://cyanophage.github.io/playground.html?layout=qwfpb%3Duoyj%5Cnlstg-eaihkzmcdv%2F%3B%2C.%27*rx&mode=ergo&lan=english&thumb=l",
    },
    {
      label: "Ranking",
      href: "https://altalpha.timvink.nl/?highlight=valmak",
    },
    {
      label: "Reddit",
      href: "https://www.reddit.com/r/KeyboardLayouts/comments/1t03wsh/valmak_a_thumbalpha_evolution_of_colemakdh/",
    },
  ],
};
