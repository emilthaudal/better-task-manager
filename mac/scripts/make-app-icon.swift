import AppKit
import CoreGraphics

// Renders the app icon: a macOS-grid squircle with a deep blue gradient and a
// white critical path — three nodes joined by sweeping curves, the last one red.
let size: CGFloat = 1024
let out = CommandLine.arguments[1]
let space = CGColorSpace(name: CGColorSpace.displayP3)!
let ctx = CGContext(data: nil, width: Int(size), height: Int(size), bitsPerComponent: 8, bytesPerRow: 0,
                    space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!

// macOS icon grid: 824pt body centred in 1024 with a ~185pt continuous corner.
let body = CGRect(x: 100, y: 100, width: 824, height: 824)
let shape = CGPath(roundedRect: body, cornerWidth: 186, cornerHeight: 186, transform: nil)

ctx.saveGState()
ctx.setShadow(offset: CGSize(width: 0, height: -10), blur: 28, color: CGColor(gray: 0, alpha: 0.28))
ctx.addPath(shape)
ctx.setFillColor(CGColor(gray: 0, alpha: 1))
ctx.fillPath()
ctx.restoreGState()

ctx.saveGState()
ctx.addPath(shape)
ctx.clip()
let gradient = CGGradient(colorsSpace: space, colors: [
    CGColor(colorSpace: space, components: [0.20, 0.42, 0.98, 1])!,
    CGColor(colorSpace: space, components: [0.10, 0.18, 0.62, 1])!,
] as CFArray, locations: [0, 1])!
ctx.drawLinearGradient(gradient, start: CGPoint(x: 512, y: 924), end: CGPoint(x: 512, y: 100), options: [])

// Faint lane bands behind the path.
for (i, y) in [330.0, 512.0, 694.0].enumerated() {
    ctx.setFillColor(CGColor(gray: 1, alpha: i == 1 ? 0.10 : 0.06))
    ctx.fill(CGRect(x: 100, y: y - 70, width: 824, height: 140))
}

let nodes = [CGPoint(x: 260, y: 694), CGPoint(x: 512, y: 512), CGPoint(x: 764, y: 330)]
ctx.setLineCap(.round)
ctx.setLineWidth(34)
ctx.setStrokeColor(CGColor(gray: 1, alpha: 0.95))
for (a, b) in zip(nodes, nodes.dropFirst()) {
    let reach = (b.x - a.x) * 0.55
    ctx.move(to: a)
    ctx.addCurve(to: b, control1: CGPoint(x: a.x + reach, y: a.y), control2: CGPoint(x: b.x - reach, y: b.y))
    ctx.strokePath()
}
for (i, node) in nodes.enumerated() {
    let r: CGFloat = 70
    let rect = CGRect(x: node.x - r, y: node.y - r, width: r * 2, height: r * 2)
    ctx.setFillColor(i == nodes.count - 1
        ? CGColor(colorSpace: space, components: [1.0, 0.30, 0.26, 1])!
        : CGColor(gray: 1, alpha: 1))
    ctx.fillEllipse(in: rect)
    ctx.setStrokeColor(CGColor(gray: 1, alpha: 1))
    ctx.setLineWidth(18)
    ctx.strokeEllipse(in: rect.insetBy(dx: 9, dy: 9))
}
ctx.restoreGState()

// Hairline edge highlight, like the system icons.
ctx.addPath(shape)
ctx.setStrokeColor(CGColor(gray: 1, alpha: 0.25))
ctx.setLineWidth(3)
ctx.strokePath()

let image = ctx.makeImage()!
let rep = NSBitmapImageRep(cgImage: image)
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: out))
