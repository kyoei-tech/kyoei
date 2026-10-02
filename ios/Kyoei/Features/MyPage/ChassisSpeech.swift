import KyoeiCore
import Observation
import SwiftUI
#if os(iOS)
@preconcurrency import AVFoundation
@preconcurrency import Speech

/// 音声で車台番号: Japanese speech recognition (on-device when available).
/// The transcript is turned into a number by SpokenChassis.normalize and
/// shown for the driver to check before it is matched.
@MainActor
@Observable
final class ChassisSpeech {
    private(set) var transcript = ""
    private(set) var listening = false
    private(set) var problem: String?

    @ObservationIgnored private let engine = AVAudioEngine()
    @ObservationIgnored private var request: SFSpeechAudioBufferRecognitionRequest?
    @ObservationIgnored private var task: SFSpeechRecognitionTask?
    @ObservationIgnored private var tapInstalled = false
    @ObservationIgnored private let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "ja-JP"))

    var number: String { SpokenChassis.normalize(transcript) }

    func start() async {
        stop()
        problem = nil
        transcript = ""
        let speech = await Self.requestSpeechAuthorization()
        guard speech == .authorized else {
            problem = "音声認識が許可されていません。設定アプリの「KYOEI」で音声認識とマイクを許可してください。"
            return
        }
        guard await AVAudioApplication.requestRecordPermission() else {
            problem = "マイクの使用が許可されていません。設定アプリの「KYOEI」でマイクを許可してください。"
            return
        }
        guard let recognizer, recognizer.isAvailable else {
            problem = "いまは音声認識を使えません。電波の状況を確認するか、少し待ってからもう一度お試しください。"
            return
        }
        do {
            let audio = AVAudioSession.sharedInstance()
            try audio.setCategory(.record, mode: .measurement, options: .duckOthers)
            try audio.setActive(true, options: .notifyOthersOnDeactivation)

            let request = SFSpeechAudioBufferRecognitionRequest()
            request.shouldReportPartialResults = true
            request.taskHint = .dictation
            if recognizer.supportsOnDeviceRecognition { request.requiresOnDeviceRecognition = true }
            self.request = request

            let input = engine.inputNode
            let format = input.outputFormat(forBus: 0)
            guard format.sampleRate > 0, format.channelCount > 0 else {
                problem = "マイクを開始できませんでした。"
                stop()
                return
            }
            Self.feed(input, format: format, into: request)
            tapInstalled = true
            engine.prepare()
            try engine.start()
            listening = true

            task = Self.recognize(with: recognizer, request: request) { [weak self] text, finished in
                Task { @MainActor [weak self] in
                    guard let self else { return }
                    if let text { self.transcript = text }
                    if finished { self.stop() }
                }
            }
        } catch {
            problem = "マイクを開始できませんでした。"
            stop()
        }
    }

    // The audio tap and the recognizer call back on their own threads. Closures
    // written inside this @MainActor class would be main-actor isolated
    // (Swift 6), and the runtime stops the app when they're called off the
    // main thread — so they're made in these nonisolated helpers instead.

    private nonisolated static func requestSpeechAuthorization() async -> SFSpeechRecognizerAuthorizationStatus {
        await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { continuation.resume(returning: $0) }
        }
    }

    private nonisolated static func feed(_ input: AVAudioInputNode, format: AVAudioFormat, into request: SFSpeechAudioBufferRecognitionRequest) {
        nonisolated(unsafe) let sink = request
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in sink.append(buffer) }
    }

    /// `update(transcript, finished)` runs on the recognizer's queue.
    private nonisolated static func recognize(
        with recognizer: SFSpeechRecognizer,
        request: SFSpeechAudioBufferRecognitionRequest,
        update: @escaping @Sendable (String?, Bool) -> Void
    ) -> SFSpeechRecognitionTask {
        recognizer.recognitionTask(with: request) { result, error in
            update(result?.bestTranscription.formattedString, (result?.isFinal ?? false) || error != nil)
        }
    }

    func stop() {
        if engine.isRunning { engine.stop() }
        // Always: a tap left behind by a failed start would make the next
        // installTap fail.
        if tapInstalled {
            engine.inputNode.removeTap(onBus: 0)
            tapInstalled = false
        }
        request?.endAudio()
        request = nil
        task?.cancel()
        task = nil
        if listening {
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        }
        listening = false
    }
}
#else
@MainActor
@Observable
final class ChassisSpeech {
    private(set) var transcript = ""
    private(set) var listening = false
    private(set) var problem: String? = "音声入力は iPhone でのみ使えます。"
    var number: String { "" }
    func start() async {}
    func stop() {}
}
#endif
