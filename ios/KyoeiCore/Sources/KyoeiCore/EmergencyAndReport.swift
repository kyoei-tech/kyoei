import Foundation

// 緊急連絡先 (emergency_contacts, shared) and 事故報告 (device-only). Ports of
// emergency-contacts-view.tsx and accident-report-view.tsx.

// MARK: - 緊急連絡先

public struct EmergencyContactRow: Codable, Equatable, Identifiable, Sendable {
    public static let selectColumns = "id, name, hours, phone, summary, sort_order"

    public var id: String
    public var name: String
    public var hours: String
    public var phone: String
    public var summary: String?
    public var sort_order: Int
}

/// Single-row shared memos (emergency_contacts_memo / accident_report_memo, id 'current').
public struct SharedNoteRow: Codable, Equatable, Sendable {
    public var id: String
    public var content: String
}

public struct EmergencyContactDraft: Equatable, Sendable {
    public static let timeOptions: [String] = (0..<48).map { "\(pad2($0 / 2)):\($0 % 2 == 0 ? "00" : "30")" }
    public static let twentyFourHours = "24時間対応"

    public var name = ""
    public var phone = ""
    public var summary = ""
    public var is24h = false
    public var startTime = "09:00"
    public var endTime = "18:00"

    public init() {}

    /// Parses the stored hours text ("24時間対応" or "09:00〜18:00"); anything
    /// unrecognized falls back to 09:00〜18:00.
    public init(_ row: EmergencyContactRow) {
        name = row.name
        phone = row.phone
        summary = row.summary ?? ""
        if row.hours.contains("24") {
            is24h = true
            return
        }
        let pattern = /(\d{1,2}):(\d{2}).*?(\d{1,2}):(\d{2})/
        if let match = row.hours.firstMatch(of: pattern) {
            let start = "\(pad2(Int(match.1) ?? 0)):\(match.2)"
            let end = "\(pad2(Int(match.3) ?? 0)):\(match.4)"
            if Self.timeOptions.contains(start) && Self.timeOptions.contains(end) {
                startTime = start
                endTime = end
            }
        }
    }

    public var hoursText: String { is24h ? Self.twentyFourHours : "\(startTime)〜\(endTime)" }
    public var canSave: Bool { !name.trimmingCharacters(in: .whitespaces).isEmpty }
}

// MARK: - 事故報告 (device-local)

public enum CarOwnership: String, Codable, CaseIterable, Sendable {
    case unset = ""
    case company
    case personal = "private"

    public var label: String {
        switch self {
        case .unset: "選択してください"
        case .company: "社用車"
        case .personal: "自家用車"
        }
    }
}

/// One other party. Photos are file names inside the report's folder.
public struct AccidentParty: Codable, Equatable, Identifiable, Sendable {
    public var id = UUID().uuidString
    public var name = ""
    public var address = ""
    public var licensePhotoFront: String?
    public var licensePhotoBack: String?
    public var phone = ""
    public var insuranceCompany = ""
    public var policyNumber = ""
    public var plateNumber = ""
    public var vehicleType = ""
    public var ownership: CarOwnership = .unset

    public init() {}

    public var isEmpty: Bool {
        [name, address, phone, insuranceCompany, policyNumber, plateNumber, vehicleType]
            .allSatisfy { $0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
            && licensePhotoFront == nil && licensePhotoBack == nil && ownership == .unset
    }

    /// The typed-in details, as rendered on the shareable info card.
    public var cardRows: [(label: String, value: String)] {
        func value(_ s: String) -> String {
            let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
            return t.isEmpty ? "（未入力）" : t
        }
        return [
            ("氏名", value(name)),
            ("住所", value(address)),
            ("電話番号", value(phone)),
            ("保険会社名", value(insuranceCompany)),
            ("証券番号または契約番号", value(policyNumber)),
            ("車種", value(vehicleType)),
            ("車のナンバー", value(plateNumber)),
            ("社用車か否か", ownership == .unset ? "（未選択）" : ownership.label),
        ]
    }
}

public struct AccidentReport: Codable, Equatable, Sendable {
    public var parties: [AccidentParty] = [AccidentParty()]
    public var completedAt: Date?

    public init() {}

    public var isCompleted: Bool { completedAt != nil }

    public mutating func addParty() {
        parties.append(AccidentParty())
    }

    /// At least one party always remains.
    public mutating func removeParty(id: String) {
        guard parties.count > 1 else { return }
        parties.removeAll { $0.id == id }
    }

    /// Every photo file still referenced by the report.
    public var photoFiles: Set<String> {
        Set(parties.flatMap { [$0.licensePhotoFront, $0.licensePhotoBack].compactMap { $0 } })
    }

    /// File names for 画像として保存, in order: info card, front, back per party.
    public func exportNames() -> [(partyIndex: Int, kind: ExportKind, fileName: String)] {
        parties.enumerated().flatMap { index, party -> [(Int, ExportKind, String)] in
            guard !party.isEmpty else { return [] }
            var items: [(Int, ExportKind, String)] = [(index, .info, "相手\(index + 1)_情報.jpg")]
            if party.licensePhotoFront != nil { items.append((index, .licenseFront, "相手\(index + 1)_免許証表.jpg")) }
            if party.licensePhotoBack != nil { items.append((index, .licenseBack, "相手\(index + 1)_免許証裏.jpg")) }
            return items
        }
    }

    public enum ExportKind: Equatable, Sendable { case info, licenseFront, licenseBack }
}
