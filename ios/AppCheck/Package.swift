// swift-tools-version: 6.0
// Dev-only: compiles the iOS app sources (../Kyoei, symlinked) for macOS so
// they can be typechecked with just the Command Line Tools — no Xcode or
// iOS SDK needed. iOS-only modifiers are wrapped in Components/Platform.swift.
// The real app is built from ../project.yml.
//
//   swift build    (from ios/AppCheck)
import PackageDescription

let package = Package(
    name: "KyoeiAppCheck",
    platforms: [.macOS(.v14)],
    dependencies: [
        .package(path: "../KyoeiCore"),
        .package(url: "https://github.com/supabase/supabase-swift", from: "2.55.0"),
    ],
    targets: [
        .executableTarget(
            name: "KyoeiAppCheck",
            dependencies: [
                "KyoeiCore",
                .product(name: "Supabase", package: "supabase-swift"),
            ]
        ),
    ]
)
