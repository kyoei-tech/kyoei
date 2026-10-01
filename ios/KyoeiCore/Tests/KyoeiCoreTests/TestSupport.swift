import Foundation
@testable import KyoeiCore

/// Tests always run on Japan time so local-day rules don't depend on the machine.
let tokyo: Calendar = {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(identifier: "Asia/Tokyo")!
    return calendar
}()

func date(_ y: Int, _ mo: Int, _ d: Int, _ h: Int = 0, _ mi: Int = 0, _ s: Int = 0) -> Date {
    tokyo.date(from: DateComponents(year: y, month: mo, day: d, hour: h, minute: mi, second: s))!
}

let minute: TimeInterval = 60
let hour: TimeInterval = 3600

func trip(_ id: String, from departed: Date, to returned: Date, splitRest: TimeInterval? = nil) -> TripHistoryEntry {
    TripHistoryEntry(id: id, departedAt: departed, returnedAt: returned, splitRestRemaining: splitRest)
}
