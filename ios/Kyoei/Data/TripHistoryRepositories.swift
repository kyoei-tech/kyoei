import Foundation
import KyoeiCore
import Supabase

// 運行履歴 edits, rest-day memos and calendar overrides — all scoped to this
// device's own rows via device_id. Ports of lib/trip-history.ts and
// lib/attendance-overrides.ts.

extension TripHistoryRepository {
    private struct Times: Encodable {
        var departed_at: String
        var returned_at: String
    }

    private struct Memo: Encodable {
        var process_memo: String?
        var traffic_memo: String?
        var free_memo: String?
    }

    private struct RestDayNoteUpsert: Encodable {
        var device_id: String
        var trip_id: String
        var memo: String
        var updated_at: String
    }

    static func delete(id: String) async throws {
        try await Backend.client.from("trip_history").delete()
            .eq("id", value: id).eq("device_id", value: DeviceID.current).execute()
    }

    static func updateTimes(id: String, departedAt: Date, returnedAt: Date) async throws {
        try await Backend.client.from("trip_history")
            .update(Times(departed_at: DBTimestamp.format(departedAt), returned_at: DBTimestamp.format(returnedAt)))
            .eq("id", value: id).eq("device_id", value: DeviceID.current).execute()
    }

    /// Blank fields are stored as null.
    static func updateMemo(id: String, process: String, traffic: String, free: String) async throws {
        func normalized(_ s: String) -> String? {
            let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
            return t.isEmpty ? nil : t
        }
        try await Backend.client.from("trip_history")
            .update(Memo(process_memo: normalized(process), traffic_memo: normalized(traffic), free_memo: normalized(free)))
            .eq("id", value: id).eq("device_id", value: DeviceID.current).execute()
    }

    static func fetchRestDayNotes() async throws -> [RestDayNoteRow] {
        try await Backend.client.from("trip_rest_day_notes").select("trip_id, memo")
            .eq("device_id", value: DeviceID.current).execute().value
    }

    /// Memo for the rest gap that precedes `tripID`.
    static func setRestDayNote(tripID: String, memo: String) async throws {
        try await Backend.client.from("trip_rest_day_notes")
            .upsert(RestDayNoteUpsert(device_id: DeviceID.current, trip_id: tripID,
                                      memo: memo.trimmingCharacters(in: .whitespacesAndNewlines),
                                      updated_at: DBTimestamp.format(Date())))
            .execute()
    }
}

enum AttendanceOverrideRepository {
    private struct Upsert: Encodable {
        var device_id: String
        var day: String
        var kind: String
        var shift_days: Int?
        var label: String?
        var updated_at: String
    }

    static func fetch() async throws -> [AttendanceOverrideRow] {
        try await Backend.client.from("attendance_day_overrides").select(AttendanceOverrideRow.selectColumns)
            .eq("device_id", value: DeviceID.current).execute().value
    }

    /// Shifts a workday by ±1 day; 0 restores it. Workdays can't be deleted.
    static func setWorkdayShift(day: LocalDate, shiftDays: Int) async throws {
        if shiftDays == 0 {
            try await delete(day: day, kind: .workdayShift)
        } else {
            try await upsert(day: day, kind: .workdayShift, shiftDays: shiftDays, label: nil)
        }
    }

    /// Custom holiday text; empty restores the default label.
    static func setHolidayLabel(day: LocalDate, label: String) async throws {
        let trimmed = label.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            try await delete(day: day, kind: .holidayLabel)
        } else {
            try await upsert(day: day, kind: .holidayLabel, shiftDays: nil, label: trimmed)
        }
    }

    /// Removes a holiday entirely (its cell shows blank).
    static func removeHoliday(day: LocalDate) async throws {
        try await delete(day: day, kind: .holidayLabel)
        try await upsert(day: day, kind: .holidayRemoved, shiftDays: nil, label: nil)
    }

    private static func upsert(day: LocalDate, kind: AttendanceOverrideKind, shiftDays: Int?, label: String?) async throws {
        try await Backend.client.from("attendance_day_overrides")
            .upsert(Upsert(device_id: DeviceID.current, day: day.iso, kind: kind.rawValue, shift_days: shiftDays, label: label,
                           updated_at: DBTimestamp.format(Date())),
                    onConflict: "device_id,day")
            .execute()
    }

    private static func delete(day: LocalDate, kind: AttendanceOverrideKind) async throws {
        try await Backend.client.from("attendance_day_overrides").delete()
            .eq("device_id", value: DeviceID.current).eq("day", value: day.iso).eq("kind", value: kind.rawValue).execute()
    }
}
