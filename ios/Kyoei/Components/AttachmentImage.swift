import KyoeiCore
import SwiftUI
#if canImport(UIKit)
import UIKit
#else
import AppKit
#endif

/// Displays an image attachment from Supabase Storage (or a legacy remote URL).
struct AttachmentImage: View {
    let reference: AttachmentReference
    var contentMode: ContentMode = .fit

    @State private var phase: Phase = .loading

    private enum Phase {
        case loading, failed
        case loaded(Image)
    }

    var body: some View {
        Group {
            switch phase {
            case .loading:
                ProgressView().frame(maxWidth: .infinity, minHeight: 120)
            case .failed:
                Image(systemName: "photo.badge.exclamationmark")
                    .font(.system(size: 28))
                    .foregroundStyle(Color.mutedForeground)
                    .frame(maxWidth: .infinity, minHeight: 120)
                    .accessibilityLabel("画像を読み込めませんでした")
            case .loaded(let image):
                image.resizable().aspectRatio(contentMode: contentMode)
            }
        }
        .task(id: reference) {
            phase = .loading
            do {
                let data = try await AttachmentStore.shared.data(for: reference)
                phase = Self.image(from: data).map(Phase.loaded) ?? .failed
            } catch {
                phase = .failed
            }
        }
    }

    private static func image(from data: Data) -> Image? { Image(imageData: data) }
}

extension Image {
    /// Decodes image file data (JPEG, PNG, HEIC…).
    init?(imageData data: Data) {
        #if canImport(UIKit)
        guard let image = UIImage(data: data) else { return nil }
        self.init(uiImage: image)
        #else
        guard let image = NSImage(data: data) else { return nil }
        self.init(nsImage: image)
        #endif
    }
}
