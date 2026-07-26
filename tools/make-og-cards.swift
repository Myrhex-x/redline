// ScanRecords — per-company OG share cards (1200×630 PNG).
//
// Run locally on macOS:  swift tools/make-og-cards.swift
// Writes assets/og/<slug>.png + assets/og/cards.json (slug → status manifest).
//
// Cards bake in the company's STATUS, and statuses can change. The manifest
// lets build-site.mjs detect a stale card (status drift) and fall back to the
// generic og.png with a warning — regenerate here whenever a status changes.
// CI never runs this (ubuntu, no AppKit); cards are committed assets.

import AppKit
import CoreText
import Foundation

let root = FileManager.default.currentDirectoryPath
let outDir = "\(root)/assets/og"
try? FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true)

// ---- fonts: Space Grotesk (converted to ttf in .cache-fonts), SF fallback
for w in ["500", "700"] {
    let url = URL(fileURLWithPath: "\(root)/.cache-fonts/space-grotesk-\(w).ttf")
    CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
}
func grotesk(_ size: CGFloat, bold: Bool) -> NSFont {
    // PostScript names as they come out of the Google-Fonts static woff2s
    NSFont(name: bold ? "SpaceGroteskLight-Bold" : "SpaceGroteskLight-Medium", size: size)
        ?? NSFont.systemFont(ofSize: size, weight: bold ? .bold : .medium)
}

// ---- data
struct Target { let slug: String, name: String, status: String }
let data = try! Data(contentsOf: URL(fileURLWithPath: "\(root)/companies.json"))
let json = try! JSONSerialization.jsonObject(with: data) as! [String: Any]
var targets: [Target] = []
for c in json["companies"] as! [[String: Any]] {
    let cc = c["chatControl"] as? [String: Any]
    targets.append(Target(slug: c["slug"] as! String, name: c["name"] as! String,
                          status: cc?["status"] as? String ?? "unclear"))
}
for i in json["institutions"] as? [[String: Any]] ?? [] {
    targets.append(Target(slug: i["slug"] as! String, name: i["name"] as! String, status: "inst"))
}

// ---- status presentation (mirrors STATUS in build-site.mjs)
func rgb(_ hex: UInt32) -> NSColor {
    NSColor(srgbRed: CGFloat((hex >> 16) & 0xff) / 255,
            green: CGFloat((hex >> 8) & 0xff) / 255,
            blue: CGFloat(hex & 0xff) / 255, alpha: 1)
}
let RED = rgb(0xEF7078), GREEN = rgb(0x57C46F), GRAY = rgb(0x9AA2AA), BLUE = rgb(0x5B7FC7)
struct Look { let label: String, verdict: String, color: NSColor, ring: Bool }
let LOOKS: [String: Look] = [
    "confirmed": Look(label: "SCANS UNDER THE EU'S CHAT CONTROL", verdict: "Scans under Chat Control — confirmed", color: RED, ring: false),
    "global":    Look(label: "SCANS GLOBALLY — NO EU EVIDENCE", verdict: "Scans under US law · no EU evidence", color: RED, ring: true),
    "unclear":   Look(label: "NO CLEAR STATEMENT", verdict: "Won't say", color: GRAY, ring: true),
    "denies":    Look(label: "STATES IT DOES NOT SCAN", verdict: "Says it doesn't scan", color: GREEN, ring: true),
    "e2ee":      Look(label: "END-TO-END ENCRYPTED — OUT OF SCOPE", verdict: "Can't read your messages", color: GREEN, ring: false),
    "inst":      Look(label: "INSTITUTIONAL SOURCE", verdict: "The law's own paper trail", color: BLUE, ring: false),
]

let W: CGFloat = 1200, H: CGFloat = 630

// ---- the eye (same geometry as EYE_SVG: 560×360 viewBox)
func drawEye(at origin: NSPoint, width: CGFloat, dim: CGFloat) {
    let s = width / 560
    func pt(_ x: CGFloat, _ y: CGFloat) -> NSPoint {
        // viewBox y grows down; AppKit y grows up — flip inside the box
        NSPoint(x: origin.x + x * s, y: origin.y + (360 - y) * s)
    }
    let eye = NSBezierPath()
    eye.move(to: pt(40, 180))
    eye.curve(to: pt(520, 180), controlPoint1: pt(150, 62), controlPoint2: pt(410, 62))
    eye.curve(to: pt(40, 180), controlPoint1: pt(410, 298), controlPoint2: pt(150, 298))
    eye.close()
    NSColor.white.withAlphaComponent(dim).setFill()
    eye.fill()
    let iris = NSBezierPath(ovalIn: NSRect(x: pt(280, 180).x - 96 * s, y: pt(280, 180).y - 96 * s + (pt(280, 180).y - pt(280, 180).y), width: 192 * s, height: 192 * s))
    rgb(0x34579F).withAlphaComponent(dim).setFill()
    iris.fill()
    // 12 stars on a ring, radius 62, star radius 11 (5-point)
    rgb(0xFFD21F).withAlphaComponent(dim).setFill()
    for k in 0..<12 {
        let a = (CGFloat(k) * 30 - 90) * .pi / 180
        let sx = 280 + 62 * cos(a), sy = 180 + 62 * sin(a)
        let star = NSBezierPath()
        for i in 0..<10 {
            let r: CGFloat = i % 2 == 1 ? 11 * 0.381 : 11
            let b = -CGFloat.pi / 2 + CGFloat(i) * .pi / 5
            let p = pt(sx + r * cos(b), sy + r * sin(b))
            i == 0 ? star.move(to: p) : star.line(to: p)
        }
        star.close()
        star.fill()
    }
}

func draw(_ t: Target, look: Look) -> NSBitmapImageRep {
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(W), pixelsHigh: Int(H),
        bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
        colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)

    // background + faint scanlines (the hero's texture)
    rgb(0x0A0C0F).setFill()
    NSRect(x: 0, y: 0, width: W, height: H).fill()
    NSColor.white.withAlphaComponent(0.018).setFill()
    var y: CGFloat = 0
    while y < H { NSRect(x: 0, y: y, width: W, height: 1.2).fill(); y += 4 }

    // eye, right side, vertically centered
    drawEye(at: NSPoint(x: W - 390, y: (H - 360 * (320.0 / 560)) / 2 - 12), width: 320, dim: 0.95)

    func text(_ s: String, _ font: NSFont, _ color: NSColor, x: CGFloat, topY: CGFloat, kern: CGFloat = 0) {
        let a = NSAttributedString(string: s, attributes: [.font: font, .foregroundColor: color, .kern: kern])
        a.draw(at: NSPoint(x: x, y: H - topY - a.size().height))
    }

    // wordmark
    text("Scan", grotesk(36, bold: true), .white, x: 70, topY: 56)
    let scanW = NSAttributedString(string: "Scan", attributes: [.font: grotesk(36, bold: true)]).size().width
    text("Records", grotesk(36, bold: false), rgb(0x8B949E), x: 70 + scanW + 2, topY: 56)

    // status row: dot + label
    let dotY = H - 214
    let dot = NSBezierPath(ovalIn: NSRect(x: 70, y: dotY, width: 18, height: 18))
    if look.ring {
        look.color.setStroke(); dot.lineWidth = 3; dot.stroke()
    } else {
        look.color.setFill(); dot.fill()
    }
    text(look.label, grotesk(24, bold: false), look.color, x: 102, topY: 200, kern: 2.2)

    // company name — shrink to fit beside the eye
    let short = t.name.components(separatedBy: " (")[0]
    var size: CGFloat = 92
    while NSAttributedString(string: short, attributes: [.font: grotesk(size, bold: true)]).size().width > 730, size > 40 { size -= 4 }
    text(short, grotesk(size, bold: true), .white, x: 66, topY: 248)

    // verdict
    text(look.verdict, grotesk(40, bold: false), look.color, x: 70, topY: 268 + size * 1.18)

    // footer
    text("scanrecords.org — the Chat Control policy archive, recorded daily", grotesk(22, bold: false), rgb(0x8B949E), x: 70, topY: H - 76)

    NSGraphicsContext.restoreGraphicsState()
    return rep
}

var manifest: [String: String] = [:]
for t in targets {
    let look = LOOKS[t.status] ?? LOOKS["unclear"]!
    let rep = draw(t, look: look)
    let png = rep.representation(using: .png, properties: [:])!
    try! png.write(to: URL(fileURLWithPath: "\(outDir)/\(t.slug).png"))
    manifest[t.slug] = t.status
    print("card \(t.slug) (\(t.status)) \(png.count / 1024) KB")
}
let mj = try! JSONSerialization.data(withJSONObject: manifest, options: [.sortedKeys])
try! mj.write(to: URL(fileURLWithPath: "\(outDir)/cards.json"))
print("\(targets.count) cards → assets/og/")
