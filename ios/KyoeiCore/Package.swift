// swift-tools-version: 6.0
// KyoeiCore: framework-free domain logic and data models shared by the
// iOS app (ios/Kyoei). Ported 1:1 from the web app's lib/*.ts so the legal
// timer rules (改善基準告示) behave identically. Foundation only, so it
// builds and tests on macOS with `swift test` — no Xcode required.
import PackageDescription

let package = Package(
    name: "KyoeiCore",
    defaultLocalization: "ja",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "KyoeiCore", targets: ["KyoeiCore"]),
    ],
    targets: [
        .target(name: "KyoeiCore"),
        .testTarget(name: "KyoeiCoreTests", dependencies: ["KyoeiCore"]),
    ]
)
