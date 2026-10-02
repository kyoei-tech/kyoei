import KyoeiCore
import SwiftUI
#if os(iOS)
@preconcurrency import AVFoundation
import Vision

/// The camera for 車台番号: preview, ライト (torch on the same device, so
/// toggling it never disturbs the session), pinch zoom, tap to focus, live
/// reading of the preview frames (かざすだけで照合) and a shutter. Photos and
/// frames stay in memory; nothing is saved unless a 記録 keeps it.
final class ChassisCamera: NSObject, @unchecked Sendable, AVCapturePhotoCaptureDelegate, AVCaptureVideoDataOutputSampleBufferDelegate {
    let session = AVCaptureSession()
    private let output = AVCapturePhotoOutput()
    private let frames = AVCaptureVideoDataOutput()
    private let queue = DispatchQueue(label: "jp.kyoei.chassis-camera")
    /// Frames are read here, one at a time; frames arriving meanwhile are dropped.
    private let frameQueue = DispatchQueue(label: "jp.kyoei.chassis-camera.frames")
    private var device: AVCaptureDevice?
    private var pending: CheckedContinuation<Data?, Never>?
    private var configured = false
    /// Set on frameQueue only.
    private var onLines: (@Sendable ([String]) -> Void)?
    private var lastRead = Date.distantPast
    /// Seconds between two frame readings.
    private static let readInterval: TimeInterval = 0.35

    func start() {
        queue.async { [self] in
            if !configured { configure() }
            if !session.isRunning { session.startRunning() }
        }
    }

    func stop() {
        readFrames(nil)
        queue.async { [self] in
            setTorchLocked(false)
            if session.isRunning { session.stopRunning() }
        }
    }

    private func configure() {
        configured = true
        session.beginConfiguration()
        session.sessionPreset = .photo
        if let camera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
           let input = try? AVCaptureDeviceInput(device: camera), session.canAddInput(input) {
            session.addInput(input)
            device = camera
            if let _ = try? camera.lockForConfiguration() {
                if camera.isFocusModeSupported(.continuousAutoFocus) { camera.focusMode = .continuousAutoFocus }
                if camera.isAutoFocusRangeRestrictionSupported { camera.autoFocusRangeRestriction = .near }
                camera.unlockForConfiguration()
            }
        }
        if session.canAddOutput(output) {
            session.addOutput(output)
            output.maxPhotoQualityPrioritization = .quality
        }
        if session.canAddOutput(frames) {
            frames.alwaysDiscardsLateVideoFrames = true
            frames.setSampleBufferDelegate(self, queue: frameQueue)
            session.addOutput(frames)
        }
        session.commitConfiguration()
    }

    /// Reads the text lines of preview frames (a few per second) and hands
    /// them to `handler`, on a background queue; nil stops reading.
    func readFrames(_ handler: (@Sendable ([String]) -> Void)?) {
        frameQueue.async { [self] in
            onLines = handler
            lastRead = .distantPast
        }
    }

    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        guard let onLines, Date().timeIntervalSince(lastRead) >= Self.readInterval,
              let pixels = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        lastRead = Date()
        // Portrait only: the back camera's frames are rotated right.
        let lines = ChassisTextReader.lines(in: VNImageRequestHandler(cvPixelBuffer: pixels, orientation: .right))
        if !lines.isEmpty { onLines(lines) }
    }

    var hasTorch: Bool { AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back)?.hasTorch ?? false }

    func setTorch(_ on: Bool) {
        queue.async { [self] in setTorchLocked(on) }
    }

    private func setTorchLocked(_ on: Bool) {
        guard let device, device.hasTorch, (try? device.lockForConfiguration()) != nil else { return }
        if on { try? device.setTorchModeOn(level: AVCaptureDevice.maxAvailableTorchLevel) } else { device.torchMode = .off }
        device.unlockForConfiguration()
    }

    func zoom(by scale: CGFloat, from start: CGFloat) -> CGFloat {
        guard let device else { return start }
        let factor = min(max(start * scale, 1), min(device.activeFormat.videoMaxZoomFactor, 6))
        queue.async {
            guard (try? device.lockForConfiguration()) != nil else { return }
            device.videoZoomFactor = factor
            device.unlockForConfiguration()
        }
        return factor
    }

    var zoomFactor: CGFloat { device?.videoZoomFactor ?? 1 }

    func focus(at devicePoint: CGPoint) {
        queue.async { [self] in
            guard let device, (try? device.lockForConfiguration()) != nil else { return }
            if device.isFocusPointOfInterestSupported {
                device.focusPointOfInterest = devicePoint
                device.focusMode = .autoFocus
            }
            if device.isExposurePointOfInterestSupported {
                device.exposurePointOfInterest = devicePoint
                device.exposureMode = .autoExpose
            }
            device.unlockForConfiguration()
        }
    }

    /// JPEG of one shot (the torch, if on, stays on; no separate flash).
    func capture() async -> Data? {
        await withCheckedContinuation { continuation in
            queue.async { [self] in
                guard session.isRunning, pending == nil else { continuation.resume(returning: nil); return }
                pending = continuation
                let settings = AVCapturePhotoSettings(format: [AVVideoCodecKey: AVVideoCodecType.jpeg])
                settings.flashMode = .off
                settings.photoQualityPrioritization = .quality
                output.capturePhoto(with: settings, delegate: self)
            }
        }
    }

    func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        let data = error == nil ? photo.fileDataRepresentation() : nil
        queue.async { [self] in
            pending?.resume(returning: data)
            pending = nil
        }
    }
}

/// Live preview with pinch-to-zoom and tap-to-focus.
struct ChassisCameraPreview: UIViewRepresentable {
    let camera: ChassisCamera

    func makeUIView(context: Context) -> PreviewView {
        let view = PreviewView()
        view.previewLayer.session = camera.session
        view.previewLayer.videoGravity = .resizeAspectFill
        view.camera = camera
        return view
    }

    func updateUIView(_ view: PreviewView, context: Context) {}

    final class PreviewView: UIView {
        override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
        var previewLayer: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
        weak var camera: ChassisCamera?
        private var zoomStart: CGFloat = 1

        override init(frame: CGRect) {
            super.init(frame: frame)
            addGestureRecognizer(UIPinchGestureRecognizer(target: self, action: #selector(pinch(_:))))
            addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(tap(_:))))
        }

        required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

        @objc private func pinch(_ gesture: UIPinchGestureRecognizer) {
            guard let camera else { return }
            if gesture.state == .began { zoomStart = camera.zoomFactor }
            _ = camera.zoom(by: gesture.scale, from: zoomStart)
        }

        @objc private func tap(_ gesture: UITapGestureRecognizer) {
            camera?.focus(at: previewLayer.captureDevicePointConverted(fromLayerPoint: gesture.location(in: self)))
        }
    }
}

/// Text lines in a photo (Vision, on-device). Each line contributes its best
/// reading and one alternative, so a single misread character can still
/// match exactly; only chassis-shaped strings are kept by the caller.
enum ChassisTextReader {
    static func lines(in jpeg: Data) async -> [String] {
        await Task.detached(priority: .userInitiated) {
            guard let source = CGImageSourceCreateWithData(jpeg as CFData, nil),
                  let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else { return [] }
            let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
            let raw = (properties?[kCGImagePropertyOrientation] as? UInt32) ?? 1
            let orientation = CGImagePropertyOrientation(rawValue: raw) ?? .up
            return lines(in: VNImageRequestHandler(cgImage: image, orientation: orientation))
        }.value
    }

    /// Synchronous; call off the main thread.
    static func lines(in handler: VNImageRequestHandler) -> [String] {
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = false
        request.recognitionLanguages = ["en-US"]
        try? handler.perform([request])
        return (request.results ?? []).flatMap { observation in
            observation.topCandidates(2).map(\.string)
        }
    }
}
#endif
