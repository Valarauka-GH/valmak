// Interactive keyboard component — SVG renderer + interaction overlays.
// layout.js holds keymap data.
// keyboard.css holds styling.
//
// Usage:
//   import { mount } from "./keyboard.js";
//   import layout from "./layout.js";
//   mount(container, layout);

const KEY_SIZE = 52;
const KEY_GAP = 4;
const HAND_GAP = 48;
const COMBO_BAR_OVERLAP = 4;

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

const GLYPHS = {
  shift: "⇧",
  ctrl: "⌃",
  alt: "⌥",
  win: "❖",
  space: "␣",
  backspace: "⌫", bksp: "⌫", bs: "⌫",
  enter: "↵", return: "↵", ret: "↵",
  up: "↑", down: "↓", left: "←", right: "→",
};

function displayLabel(text) {
  return GLYPHS[text] ?? text;
}

// Shrink multi-char names.
function setKeyLabel(label, text) {
  const rendered = displayLabel(text);
  label.textContent = rendered;
  label.style.fontSize = rendered.length <= 1 ? "" : "13px";
}

// Mouse hover and finger hold.
export function wireHover(element, apply) {
  element.addEventListener("pointerenter", () => apply(true));
  element.addEventListener("pointerleave", () => apply(false));
  element.addEventListener("focus", () => apply(true));
  element.addEventListener("blur", () => apply(false));
}

// ─── Layout parser ───
// Hard-fails on shape errors.
// See layout.js for examples.

const PIPE = "||";

function splitHalves(line, label, row) {
  const halves = line.split(PIPE);
  if (halves.length !== 2) {
    throw new Error(`${label} row ${row}: expected exactly one ${PIPE} separator`);
  }
  return [
    halves[0].split(/\s+/).filter((t) => t),
    halves[1].split(/\s+/).filter((t) => t),
  ];
}

function parseGrid(text, label) {
  const lines = text.trim().split("\n").map((l) => l.trim()).filter((l) => l);
  if (lines.length === 0) {
    throw new Error(`${label}: empty grid`);
  }
  const keys = [];
  const widths = [];
  lines.forEach((line, row) => {
    const [left, right] = splitHalves(line, label, row);
    pushHalfKeys(keys, left, "L", row);
    pushHalfKeys(keys, right, "R", row);
    widths.push({ left: left.length, right: right.length });
  });
  return { keys, widths };
}

// Cols are mid-out: col 0 is the inner edge of each hand.
function pushHalfKeys(keys, tokens, side, row) {
  tokens.forEach((token, i) => {
    if (token === "_") return;
    const col = side === "L" ? tokens.length - 1 - i : i;
    keys.push({ id: `${side}${row}-${col}`, side, row, col, letter: token });
  });
}

function gridToTokenMap(text, label) {
  const out = {};
  for (const k of parseGrid(text, label).keys) out[k.id] = k.letter;
  return out;
}

export function buildLayout(raw) {
  if (!raw.layers || raw.layers.length === 0) {
    throw new Error("layout must have at least one layer (the base)");
  }
  const base = raw.layers[0];
  const { keys: baseKeys, widths } = parseGrid(base.grid, base.name);
  const keysByLetter = {};
  for (const k of baseKeys) keysByLetter[k.letter] ??= k;  // first wins on dupes
  const keysById = Object.fromEntries(baseKeys.map((k) => [k.id, k]));

  // Resolve letter-keyed user-facing modifiers into the id-keyed runtime form.
  const modifiers = {};
  for (const [letter, name] of Object.entries(raw.modifiers ?? {})) {
    const key = keysByLetter[letter];
    if (!key) throw new Error(`modifiers: no key with letter "${letter}" in base`);
    modifiers[key.id] = name;
  }

  // A layer is trigger-activated iff some modifiers entry names it; the
  // rest are button-driven (e.g. the comparison overlay).
  const triggerForLayer = (layerName) => {
    for (const [id, name] of Object.entries(modifiers)) {
      if (name === layerName) return id;
    }
    return null;
  };
  const layers = raw.layers.map((layer, i) => ({
    name: layer.name,
    trigger: i === 0 ? null : triggerForLayer(layer.name),
    slot: i,
    surfaceModifiers: layer.surfaceModifiers ?? true,
    keys: i === 0
      ? Object.fromEntries(baseKeys.map((k) => [k.id, k.letter]))
      : gridToTokenMap(layer.grid, layer.name),
  }));
  const layersByName = Object.fromEntries(layers.map((l) => [l.name, l]));
  return {
    title: raw.title,
    description: raw.description,
    keys: baseKeys,
    keysById,
    widths,
    shifted: raw.shifted,
    modifiers,
    layers,
    layersByName,
    combos: raw.comboShifts === false ? [] : inferShiftCombos(modifiers, keysById, layersByName),
  };
}

// Each shift modifier gets a combo bar to both adjacent letters (if present).
function inferShiftCombos(modifiers, keysById, layersByName) {
  const combos = [];
  for (const [id, name] of Object.entries(modifiers)) {
    if (name !== "shift") continue;
    const shift = keysById[id];
    if (!shift) continue;
    for (const dCol of [-1, 1]) {
      const otherId = `${shift.side}${shift.row}-${shift.col + dCol}`;
      const other = keysById[otherId];
      if (!other) continue;
      const innerId = dCol < 0 ? otherId : id;
      const outerId = dCol < 0 ? id : otherId;
      const otherName = modifiers[otherId];
      const layer = otherName ? layersByName[otherName] ?? null : null;
      combos.push({ innerId, outerId, layer });
    }
  }
  return combos;
}

// Sizing is via CSS: the SVG fills its parent up to the .kbd max-width.
export function createKeyboard(raw, container) {
  const data = buildLayout(raw);

  const layerColorVar = (layer) => `var(--color-layer-${layer.slot})`;

  // Each hand anchors its inner edge to a fixed center; the widest row
  // in BASE sets each hand's outer extent (narrower rows recess).
  const cellStep = KEY_SIZE + KEY_GAP;
  const numRows = data.widths.length;
  const maxLeftCols = Math.max(0, ...data.widths.map((w) => w.left));
  const maxRightCols = Math.max(0, ...data.widths.map((w) => w.right));
  const innerEdgeL = maxLeftCols * cellStep;
  const innerEdgeR = innerEdgeL + HAND_GAP;

  const keyX = (k) => k.side === "L"
    ? innerEdgeL - (k.col + 1) * cellStep
    : innerEdgeR + k.col * cellStep;

  const keyY = (k) => k.row * cellStep;

  const w = innerEdgeR + maxRightCols * cellStep - KEY_GAP;
  const h = (numRows - 1) * cellStep + KEY_SIZE;
  const PAD = 2; // keeps key strokes from clipping at the viewBox edge

  const svg = svgEl("svg", {
    viewBox: `${-PAD} ${-PAD} ${w + PAD * 2} ${h + PAD * 2}`,
    role: "img",
    class: "kbd",
  });

  const title = svgEl("title");
  title.textContent = data.title;
  svg.appendChild(title);

  const desc = svgEl("desc");
  desc.textContent = data.description;
  svg.appendChild(desc);

  const keysGroup = svgEl("g", { class: "kbd__keys" });

  for (const k of data.keys) {
    const g = svgEl("g", {
      class: "key",
      "data-id": k.id,
      "data-letter": k.letter,
      transform: `translate(${keyX(k)}, ${keyY(k)})`,
    });
    g.appendChild(svgEl("rect", {
      class: "key__cap",
      width: KEY_SIZE, height: KEY_SIZE,
      rx: 6, ry: 6,
    }));
    const txt = svgEl("text", {
      class: "key__label",
      x: KEY_SIZE / 2, y: KEY_SIZE / 2,
      "text-anchor": "middle",
      "dominant-baseline": "central",
    });
    setKeyLabel(txt, k.letter);
    g.appendChild(txt);
    keysGroup.appendChild(g);
  }

  svg.appendChild(keysGroup);

  // Render combo bars + index them by inner id for runtime lookups.
  const comboBarById = {};
  for (const combo of data.combos) {
    const innerKey = data.keysById[combo.innerId];
    const outerKey = data.keysById[combo.outerId];
    const bar = svgEl("rect", {
      class: "combo-bar",
      x: Math.min(keyX(innerKey), keyX(outerKey)) + KEY_SIZE - COMBO_BAR_OVERLAP,
      y: innerKey.row * cellStep,
      width: KEY_GAP + 2 * COMBO_BAR_OVERLAP, height: KEY_SIZE,
    });
    svg.appendChild(bar);
    comboBarById[combo.innerId] = bar;
  }

  container.innerHTML = "";
  container.appendChild(svg);

  // Interaction state. render() walks renderTargets once per change
  // and computes each key's label and classes from (overlay, heldKeys).
  // Shift is "active" when any held key has the "shift" modifier role.
  const keyNodeById = {};
  const renderTargets = data.keys.map((k) => {
    const node = svg.querySelector(`.key[data-id="${k.id}"]`);
    keyNodeById[k.id] = node;
    return {
      node,
      id: k.id,
      letter: k.letter,
      label: node.querySelector(".key__label"),
      modName: data.modifiers[k.id],
    };
  });
  let overlay = null;
  let heldKeys = new Set();

  function render() {
    const shiftActive = [...heldKeys].some((id) => data.modifiers[id] === "shift");

    if (overlay) {
      svg.classList.add("kbd--layer-active");
      svg.style.setProperty("--layer-color", layerColorVar(overlay));
    } else {
      svg.classList.remove("kbd--layer-active");
      svg.style.removeProperty("--layer-color");
    }

    for (const t of renderTargets) {
      const { node, id, letter, label, modName } = t;
      node.classList.remove("key--layer-active", "key--layer-passthrough", "key--held");

      let text;
      if (overlay) {
        let layerLabel = overlay.keys[id];
        if (layerLabel === undefined && id === overlay.trigger) layerLabel = overlay.name;

        if (layerLabel !== undefined) {
          text = shiftActive ? (data.shifted[layerLabel] ?? layerLabel) : layerLabel;
          node.classList.add(id === overlay.trigger ? "key--held" : "key--layer-active");
        } else if (overlay.surfaceModifiers && modName !== undefined) {
          text = modName;
          if (heldKeys.has(id)) node.classList.add("key--held");
        } else {
          text = shiftActive ? (data.shifted[letter] ?? letter) : letter;
          node.classList.add("key--layer-passthrough");
        }
      } else if (heldKeys.has(id) && modName !== undefined) {
        text = modName;
        node.classList.add("key--held");
      } else if (shiftActive) {
        text = data.shifted[letter] ?? letter;
      } else {
        text = letter;
      }

      setKeyLabel(label, text);
    }

    // Combo bar fades along with its keys.
    for (const combo of data.combos) {
      const faded = [combo.innerId, combo.outerId].every((id) =>
        keyNodeById[id]?.classList.contains("key--layer-passthrough"),
      );
      comboBarById[combo.innerId].classList.toggle("combo-bar--faded", faded);
    }
  }

  function setHeld(activeOverlay, activeIds = []) {
    overlay = activeOverlay;
    heldKeys = new Set(activeIds);
    render();
  }

  function applyLayer(layer, on) {
    if (on) setHeld(layer, layer.trigger ? [layer.trigger] : []);
    else setHeld(null);
  }

  function wireModifiers() {
    for (const [id, name] of Object.entries(data.modifiers)) {
      const key = keyNodeById[id];
      if (!key) continue;
      const layer = data.layersByName[name] ?? null;
      key.classList.add(layer ? "key--layer" : "key--modifier");
      if (layer) key.style.setProperty("--layer-color", layerColorVar(layer));
      wireHover(key, (on) => on ? setHeld(layer, [id]) : setHeld(null));
    }
  }

  function wireCombos() {
    for (const combo of data.combos) {
      const bar = comboBarById[combo.innerId];
      if (!bar) continue;
      wireHover(bar, (on) =>
        on ? setHeld(combo.layer, [combo.innerId, combo.outerId]) : setHeld(null),
      );
    }
  }

  // Display modifiers without "pressing" them.
  function showHoldables(on) {
    for (const t of renderTargets) {
      const { node, letter, label, modName } = t;
      if (on && modName !== undefined) {
        node.classList.add("key--held");
        setKeyLabel(label, modName);
      } else {
        node.classList.remove("key--held");
        setKeyLabel(label, letter);
      }
    }
  }

  function wireInteractions() {
    wireModifiers();
    wireCombos();
  }

  return {
    svg,
    layers: data.layers,
    applyLayer,
    showHoldables,
    wireInteractions,
  };
}

export function mount(container, raw) {
  container.innerHTML = `
<div class="kbd-controls" data-kbd-controls></div>
<div data-kbd-canvas></div>
<div class="kbd-controls" data-kbd-links></div>
`;

  const $ = (sel) => container.querySelector(sel);

  const kbd = createKeyboard(raw, $("[data-kbd-canvas]"));

  // Render top controls.
  const controlsContainer = $("[data-kbd-controls]");
  for (const [name, label] of Object.entries(raw.controls)) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.dataset.kbdControl = name;
    controlsContainer.appendChild(btn);
  }

  const modifiersBtn = $('[data-kbd-control="modifiers"]');
  if (modifiersBtn) wireHover(modifiersBtn, kbd.showHoldables);

  const compareBtn = $('[data-kbd-control="compare"]');
  if (compareBtn) {
    const compareLayer = kbd.layers.find((l) => l.name === raw.controls.compare);
    if (compareLayer) {
      wireHover(compareBtn, (on) => kbd.applyLayer(compareLayer, on));
    } else {
      console.warn(`keyboard: controls.compare="${raw.controls.compare}" but no layer with that name`);
    }
  }

  // Render bottom links.
  const linksContainer = $("[data-kbd-links]");
  raw.links.forEach((link) => {
    const a = document.createElement("a");
    a.textContent = link.label;
    a.href = link.href;
    a.target = "_blank";
    a.rel = "noopener";
    linksContainer.appendChild(a);
  });

  kbd.wireInteractions();
  return kbd;
}
