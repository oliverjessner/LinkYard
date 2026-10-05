// Deterministic asset conversion; the supplied logo remains the source of truth.
import AppKit

let source = "src/assets/images/logo.png"
guard let bitmap = NSBitmapImageRep(data: try Data(contentsOf: URL(fileURLWithPath: source))) else {
    fatalError("Cannot read \(source)")
}
var minX = bitmap.pixelsWide, minY = bitmap.pixelsHigh, maxX = 0, maxY = 0
for y in 0..<bitmap.pixelsHigh {
    for x in 0..<bitmap.pixelsWide {
        if let color = bitmap.colorAt(x: x, y: y), color.alphaComponent > 0.01 {
            minX = min(minX, x); maxX = max(maxX, x)
            minY = min(minY, y); maxY = max(maxY, y)
        }
    }
}
let rect = CGRect(x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1)
guard let cropped = bitmap.cgImage?.cropping(to: rect) else { fatalError("Empty logo") }
let directory = "src/assets/icons"
try FileManager.default.createDirectory(atPath: directory, withIntermediateDirectories: true)
for size in [16, 32, 48, 128] {
    guard let context = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8,
                                  bytesPerRow: size * 4, space: CGColorSpaceCreateDeviceRGB(),
                                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
        fatalError("Cannot allocate icon")
    }
    context.interpolationQuality = .high
    let margin = Double(size) * 0.04
    let scale = (Double(size) - 2 * margin) / Double(max(cropped.width, cropped.height))
    let width = Double(cropped.width) * scale, height = Double(cropped.height) * scale
    context.draw(cropped, in: CGRect(x: (Double(size) - width) / 2,
                                     y: (Double(size) - height) / 2, width: width, height: height))
    guard let image = context.makeImage(), let data = NSBitmapImageRep(cgImage: image)
        .representation(using: .png, properties: [:]) else { fatalError("Cannot encode icon") }
    try data.write(to: URL(fileURLWithPath: "\(directory)/icon-\(size).png"))
}
print("Converted the original logo to transparent 16, 32, 48 and 128 px icons.")
