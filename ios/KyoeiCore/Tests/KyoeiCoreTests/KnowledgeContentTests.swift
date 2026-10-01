import Foundation
import Testing
@testable import KyoeiCore

@Suite struct KnowledgeContentTests {
    @Test func notesGroupingAndImages() throws {
        let notes = [
            BeginnerNoteRow(id: "1", title: "a", category: "積込"),
            BeginnerNoteRow(id: "2", title: "b", category: " "),
            BeginnerNoteRow(id: "3", title: "c", category: "積込", image_paths: ["x.jpg"]),
        ]
        let groups = BeginnerNotes.byCategory(notes)
        #expect(Set(groups.map(\.category)) == ["積込", "未分類"])
        #expect(groups.first { $0.category == "積込" }?.notes.map(\.id) == ["1", "3"])
        #expect(notes[2].images == [.stored(bucket: .beginnerNotes, path: "x.jpg")])
        #expect(BeginnerNotes.remainingImageSlots(current: 4) == 2)
        #expect(BeginnerNotes.remainingImageSlots(current: 9) == 0)
        #expect(BeginnerNotes.removedImages(previous: ["a", "b", "c"], next: ["b"]) == ["a", "c"])
        let decoded = try JSONDecoder().decode(BeginnerNoteRow.self, from: Data(#"{"id":"9","title":"t","image_paths":null,"category":null}"#.utf8))
        #expect(decoded.image_paths.isEmpty && decoded.categoryLabel == "未分類")
    }

    @Test func termsSortedSearchedAndValidated() {
        func term(_ id: String, _ t: String, reading: String = "", category: String = "", meaning: String = "") -> DictionaryTermRow {
            DictionaryTermRow(id: id, category: category, term: t, reading: reading, meaning: meaning, antonym: "", example: "")
        }
        let terms = [
            term("1", "空車", reading: "くうしゃ", category: "運行"),
            term("2", "あおり", category: "車両"),
            term("3", "実車", reading: "じっしゃ", category: "運行", meaning: "荷物を積んで走ること"),
        ]
        #expect(DriverTerms.kanaOrder(terms).map(\.id) == ["2", "1", "3"])
        let groups = DriverTerms.byCategory(terms)
        #expect(groups.first { $0.category == "運行" }?.terms.map(\.id) == ["1", "3"])
        #expect(DriverTerms.search("にもつ", in: terms, using: KanaSearch())?.map(\.id) == ["3"])
        #expect(DriverTerms.search(" ", in: terms) == nil)

        var draft = DictionaryTermDraft()
        draft.term = "回送"
        #expect(!draft.canSave) // no category chosen
        draft.category = nil
        draft.newCategory = " 新カテゴリー "
        #expect(draft.canSave && draft.finalCategory == "新カテゴリー")
        #expect(DictionaryTermDraft(terms[0]).category == "運行")
    }

    @Test func questionsAndAnswers() {
        let questions = [
            QAQuestionRow(id: "1", category: "給与", title: "締め日は？", body: "", created_at: ""),
            QAQuestionRow(id: "2", category: "", title: "駐車場", body: "どこに停める？", created_at: ""),
            QAQuestionRow(id: "3", category: "給与", title: "残業代", body: "", created_at: ""),
        ]
        let categories = QuestionsAndAnswers.categories(questions)
        #expect(categories.first { $0.name == "給与" }?.count == 2)
        #expect(QuestionsAndAnswers.categoryOptions(questions) == ["給与"])
        #expect(QuestionsAndAnswers.questions(in: "未分類", questions).map(\.id) == ["2"])
        #expect(QuestionsAndAnswers.search("とめる", in: questions, using: KanaSearch())?.map(\.id) == ["2"])
        let answers = [QAAnswerRow(id: "a", question_id: "1", title: "", responder: "総務", body: "月末", created_at: "")]
        #expect(QuestionsAndAnswers.answers(for: "1", answers).count == 1)
        #expect(QuestionsAndAnswers.answers(for: "2", answers).isEmpty)
        #expect(!QuestionsAndAnswers.canAsk(title: " ") && QuestionsAndAnswers.canAsk(title: "?"))
        #expect(!QuestionsAndAnswers.canAnswer(responder: "", body: "x") && QuestionsAndAnswers.canAnswer(responder: "a", body: "x"))
    }
}
