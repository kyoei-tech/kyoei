import Foundation
import Testing
@testable import KyoeiCore

@Suite struct AttachmentTests {
    @Test func storagePathKeepsExtensionAndAddsSuffix() {
        #expect(StoragePath.make(filename: "IMG_0001.JPG", randomSuffix: "abc") == "IMG_0001-abc.jpg")
        #expect(StoragePath.make(filename: "配車表 9月.pdf", folder: "uid-1", randomSuffix: "x") == "uid-1/9-x.pdf")
        #expect(StoragePath.make(filename: "運行 sheet (2).pdf", randomSuffix: "x") == "sheet_2-x.pdf")
        #expect(StoragePath.make(filename: "../../etc/passwd", randomSuffix: "x") == "passwd-x")
        #expect(StoragePath.make(filename: "配車表.pdf", randomSuffix: "x") == "file-x.pdf")
        #expect(StoragePath.randomSuffix().count == 21)
    }

    @Test func contentTypes() {
        #expect(StoragePath.contentType(forExtension: "PDF") == "application/pdf")
        #expect(StoragePath.contentType(forExtension: "jpeg") == "image/jpeg")
        #expect(StoragePath.contentType(forExtension: "zip") == "application/octet-stream")
    }

    @Test func attachmentReferences() {
        #expect(AttachmentReference(column: "a-x.png", bucket: .timecardTodo) == .stored(bucket: .timecardTodo, path: "a-x.png"))
        #expect(AttachmentReference(column: "https://example.com/a.png", bucket: .timecardTodo) == .remote(URL(string: "https://example.com/a.png")!))
        #expect(AttachmentReference(column: "  ", bucket: .beginnerNotes) == nil)
        #expect(AttachmentReference(column: nil, bucket: .beginnerNotes) == nil)
    }
}
