import AppKit
import Foundation

// Native menu-bar glyph: black alpha-only strokes, no app-icon background.
let destination = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "assets"
for scale in [1, 2] {
    let size = 16 * scale
    let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size,
                                 bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true,
                                 isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
    let context = NSGraphicsContext.current!.cgContext
    context.scaleBy(x: CGFloat(scale), y: CGFloat(scale))
    context.setStrokeColor(NSColor.black.cgColor)
    context.setLineCap(.round)
    context.setLineWidth(1.4)
    context.addArc(center: CGPoint(x: 8, y: 7), radius: 6, startAngle: .pi * 7 / 6,
                   endAngle: -.pi / 6, clockwise: true)
    context.strokePath()
    context.move(to: CGPoint(x: 8, y: 7)); context.addLine(to: CGPoint(x: 11, y: 10))
    context.strokePath()
    context.setFillColor(NSColor.black.cgColor)
    context.fillEllipse(in: CGRect(x: 7, y: 6, width: 2, height: 2))
    NSGraphicsContext.restoreGraphicsState()
    // Set DPI metadata after drawing: doing so before creating the context
    // also scales its CTM and clips the explicitly-scaled Retina glyph.
    bitmap.size = NSSize(width: 16, height: 16)
    for i in 0..<size {
        precondition(bitmap.colorAt(x: 0, y: i)!.alphaComponent == 0)
        precondition(bitmap.colorAt(x: size - 1, y: i)!.alphaComponent == 0)
        precondition(bitmap.colorAt(x: i, y: 0)!.alphaComponent == 0)
        precondition(bitmap.colorAt(x: i, y: size - 1)!.alphaComponent == 0)
    }
    let suffix = scale == 1 ? "" : "@2x"
    try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: destination + "/GaugeTemplate" + suffix + ".png"))
}
