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
    @ObservationIgnored private let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "ja-JP"))

    var number: String { SpokenChassis.normalize(transcript) }

    func start() async {
        stop()
        problem = nil
        transcript = ""
        let speech = await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { continuation.resume(returning: $0) }
        }
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
            nonisolated(unsafe) let sink = request
            input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in sink.append(buffer) }
            engine.prepare()
            try engine.start()
            listening = true

            task = recognizer.recognitionTask(with: request) { [weak self] result, error in
                let text = result?.bestTranscription.formattedString
                let final = result?.isFinal ?? false
                Task { @MainActor [weak self] in
                    guard let self else { return }
                    if let text { self.transcript = text }
                    if final || error != nil { self.stop() }
                }
            }
        } catch {
            problem = "マイクを開始できませんでした。"
            stop()
        }
    }

    func stop() {
        if engine.isRunning {
            engine.stop()
            engine.inputNode.removeTap(onBus: 0)
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
