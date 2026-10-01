import Foundation
import Testing
@testable import KyoeiCore

@Suite struct DispatchSheetTests {
    @Test func rowDecodingTitleAndStatus() throws {
        let json = #"[{"id":"1","blob_url":"uid/haisha-x.pdf","original_filename":"haisha.pdf","uploaded_at":"2026-10-01T09:20:00+00:00","dispatch_date":null,"vehicle_count":null},{"id":"2","blob_url":"uid/b.pdf","original_filename":"b.pdf","uploaded_at":"2026-10-01T09:20:00+00:00","dispatch_date":"09月01日","vehicle_count":17}]"#
        let rows = try JSONDecoder().decode([DispatchSheetRow].self, from: Data(json.utf8))
        #expect(!rows[0].isParsed && rows[0].title == "haisha.pdf")
        #expect(rows[1].isParsed && rows[1].title == "09月01日の配車表")
        #expect(rows[0].pdf == .stored(bucket: .dispatchSheets, path: "uid/haisha-x.pdf"))
        #expect(rows[0].uploadedLabel(calendar: tokyo) == "2026/10/01 18:20 アップロード")
    }

    @Test func onlyRealPDFsAreAccepted() {
        #expect(DispatchSheetUpload.isPDF(filename: "a.PDF", data: Data("%PDF-1.7".utf8)))
        #expect(!DispatchSheetUpload.isPDF(filename: "a.pdf", data: Data("hello".utf8)))
        #expect(!DispatchSheetUpload.isPDF(filename: "a.png", data: Data("%PDF".utf8)))
    }
}
