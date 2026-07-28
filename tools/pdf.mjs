#!/usr/bin/env node
/**
 * Minimal PDF text extraction, zero dependencies.
 *
 * Some of the most load-bearing documents this archive relies on are only
 * published as PDFs: the Article 3(1)(g)(vii) derogation reports, where a
 * provider states on a standard form which of its services it scans. Citing
 * those without archiving them is the failure this project keeps finding, so
 * they have to go through the same pipeline as everything else.
 *
 * Two producers appear in practice and both are handled:
 *   - literal strings, `(text) Tj`
 *   - hex glyph ids against a subset font, `<0003 0044> Tj`, which mean
 *     nothing without the font's /ToUnicode CMap
 *
 * Google's reports are the second kind and position every word separately, so
 * naive extraction returns either binary noise (if image streams are not
 * skipped) or one character per line with the spaces trimmed away. Both were
 * observed while writing this; the tests in tools/test-pdf.mjs pin the fix.
 *
 * Not a full PDF implementation. It reads text from Flate-compressed content
 * streams, which is what these documents are.
 */

import { inflateSync } from "node:zlib";

/** @param {Buffer} raw @returns {string} */
export function pdfText(raw) {
  const lat = raw.toString("latin1");

  const objAt = new Map();
  for (const m of lat.matchAll(/(\d+)\s+0\s+obj\b/g)) objAt.set(Number(m[1]), m.index);

  const streamOf = (objNum) => {
    const start = objAt.get(objNum);
    if (start === undefined) return null;
    const seg = lat.slice(start, lat.indexOf("endobj", start));
    const si = seg.indexOf("stream");
    if (si === -1) return null;
    let s = start + si + 6;
    if (raw[s] === 0x0d) s++;
    if (raw[s] === 0x0a) s++;
    const e = raw.indexOf("endstream", s);
    if (e === -1) return null;
    try { return inflateSync(raw.subarray(s, e)).toString("latin1"); } catch { return null; }
  };

  // Resource name (/F4) -> font object -> its ToUnicode CMap.
  const nameToObj = new Map();
  for (const m of lat.matchAll(/\/Font\s*<<([^>]*)>>/g))
    for (const f of m[1].matchAll(/\/(\w+)\s+(\d+)\s+0\s+R/g)) nameToObj.set(f[1], Number(f[2]));

  const cmaps = new Map();
  const hexToStr = (h) => String.fromCodePoint(...(h.match(/.{4}/g) ?? []).map((x) => parseInt(x, 16)));
  for (const [name, objNum] of nameToObj) {
    const start = objAt.get(objNum);
    if (start === undefined) continue;
    const seg = lat.slice(start, lat.indexOf("endobj", start));
    const tu = seg.match(/\/ToUnicode\s+(\d+)\s+0\s+R/);
    if (!tu) continue;
    const cm = streamOf(Number(tu[1]));
    if (!cm) continue;
    const map = new Map();
    for (const b of cm.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
      for (const p of b[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g))
        map.set(parseInt(p[1], 16), hexToStr(p[2]));
    for (const b of cm.matchAll(/beginbfrange([\s\S]*?)endbfrange/g))
      for (const p of b[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
        const lo = parseInt(p[1], 16), hi = parseInt(p[2], 16), dst = parseInt(p[3], 16);
        for (let c = lo; c <= hi && c - lo < 65536; c++) map.set(c, String.fromCodePoint(dst + (c - lo)));
      }
    cmaps.set(name, map);
  }

  const unesc = (s) => s
    .replace(/\\(\d{1,3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)))
    .replace(/\\n/g, " ").replace(/\\r/g, " ").replace(/\\t/g, " ")
    .replace(/\\([()\\])/g, "$1");

  const out = [];
  for (const [objNum] of objAt) {
    const content = streamOf(objNum);
    // Content streams carry text operators; image XObjects do not. Without
    // this check the literal scan cheerfully "reads" compressed pixel data.
    if (!content || !/BT\s/.test(content) || !/\bT[jJ]\b/.test(content)) continue;

    for (const bt of content.match(/BT[\s\S]*?ET/g) ?? []) {
      let font = null, piece = "";
      const decodeHex = (h) => {
        const m = cmaps.get(font);
        if (!m) return "";
        return (h.replace(/\s/g, "").match(/.{1,4}/g) ?? [])
          .map((x) => m.get(parseInt(x.padEnd(4, "0"), 16)) ?? "").join("");
      };
      const re = /\/(\w+)\s+[\d.]+\s+Tf|<([0-9a-fA-F\s]*)>\s*Tj|\(((?:[^()\\]|\\.)*)\)\s*Tj|\[((?:[^\]\\]|\\.)*)\]\s*TJ/g;
      for (const t of content === null ? [] : bt.matchAll(re)) {
        if (t[1]) font = t[1];
        else if (t[2] !== undefined) piece += decodeHex(t[2]);
        else if (t[3] !== undefined) piece += unesc(t[3]);
        else if (t[4] !== undefined) {
          for (const p of t[4].matchAll(/<([0-9a-fA-F\s]*)>|\(((?:[^()\\]|\\.)*)\)|(-?\d+(?:\.\d+)?)/g)) {
            if (p[1] !== undefined) piece += decodeHex(p[1]);
            else if (p[2] !== undefined) piece += unesc(p[2]);
            else if (Number(p[3]) < -180) piece += " "; // wide kern reads as a word gap
          }
        }
      }
      // Never trim per-fragment: these producers emit one word (sometimes one
      // glyph) per positioning operator, and trimming deletes the spaces.
      if (piece.trim()) out.push(piece);
    }
  }
  return out.join(" ").replace(/\s+/g, " ").trim();
}

if (process.argv[1]?.endsWith("pdf.mjs") && process.argv[2]) {
  const { readFileSync } = await import("node:fs");
  const src = process.argv[2];
  const buf = /^https?:/.test(src)
    ? Buffer.from(await (await fetch(src, { redirect: "follow" })).arrayBuffer())
    : readFileSync(src);
  console.log(pdfText(buf));
}
