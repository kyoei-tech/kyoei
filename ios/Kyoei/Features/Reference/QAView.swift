import KyoeiCore
import Supabase
import SwiftUI

enum QARepository {
    private struct NewQuestion: Encodable {
        var title: String
        var body: String
        var category: String
    }

    private struct NewAnswer: Encodable {
        var question_id: String
        var title: String
        var responder: String
        var body: String
    }

    static func fetchQuestions() async throws -> [QAQuestionRow] {
        try await Backend.client.from("qa_questions").select(QAQuestionRow.selectColumns)
            .order("created_at", ascending: false).execute().value
    }

    static func fetchAnswers() async throws -> [QAAnswerRow] {
        try await Backend.client.from("qa_answers").select(QAAnswerRow.selectColumns)
            .order("created_at", ascending: true).execute().value
    }

    static func ask(category: String, title: String, body: String) async throws {
        try await Backend.client.from("qa_questions").insert(NewQuestion(
            title: title.trimmingCharacters(in: .whitespaces),
            body: body.trimmingCharacters(in: .whitespacesAndNewlines),
            category: category.trimmingCharacters(in: .whitespaces)
        )).execute()
    }

    static func answer(questionID: String, responder: String, body: String) async throws {
        try await Backend.client.from("qa_answers").insert(NewAnswer(
            question_id: questionID, title: "",
            responder: responder.trimmingCharacters(in: .whitespaces),
            body: body.trimmingCharacters(in: .whitespacesAndNewlines)
        )).execute()
    }

    static func deleteQuestion(id: String) async throws {
        try await Backend.client.from("qa_questions").delete().eq("id", value: id).execute()
    }

    static func deleteAnswer(id: String) async throws {
        try await Backend.client.from("qa_answers").delete().eq("id", value: id).execute()
    }
}

/// Q&A: anonymous questions by category with named answers. Asking,
/// answering and deleting are hidden for part-time staff. Port of
/// components/qa-view.tsx.
struct QAView: View {
    @Environment(SettingsStore.self) private var settings
    @State private var questions = RealtimeTable<QAQuestionRow>(table: "qa_questions", fetch: QARepository.fetchQuestions)
    @State private var answers = RealtimeTable<QAAnswerRow>(table: "qa_answers", fetch: QARepository.fetchAnswers)
    @State private var category: String?
    @State private var questionID: String?
    @State private var query = ""
    @State private var asking = false
    @State private var askCategory = ""
    @State private var askTitle = ""
    @State private var askBody = ""
    @State private var answering = false
    @State private var answerBody = ""
    @State private var responder = ""
    @State private var confirmDeleteQuestion = false
    @State private var confirmDeleteAnswerID: String?

    private var canEdit: Bool { !settings.settings.partTimeMode }

    var body: some View {
        Group {
            if let question = questions.rows.first(where: { $0.id == questionID }) {
                detail(question)
            } else if let category {
                titles(category)
            } else {
                categories
            }
        }
        .syncing(questions)
        .syncing(answers)
    }

    private var categories: some View {
        TabPage {
            PageHeading(title: "Q&A", subtitle: "匿名で質問できます。回答には名前が必要です。") {
                if canEdit {
                    Button {
                        asking.toggle()
                        askCategory = ""; askTitle = ""; askBody = ""
                    } label: { Label(asking ? "閉じる" : "質問を追加", systemImage: asking ? "xmark" : "plus") }
                        .buttonStyle(PillButtonStyle(kind: .secondary)).fixedSize()
                }
            }
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundStyle(Color.mutedForeground)
                TextField("質問を検索", text: $query).appFont(14).autocorrectionDisabled()
            }
            .padding(.horizontal, 12).padding(.vertical, 10).card(radius: 14)
            if canEdit && asking { askForm }
            if let results = QuestionsAndAnswers.search(query, in: questions.rows) {
                if results.isEmpty { EmptyStateBox(text: "一致する質問はありません。") }
                ForEach(results) { question in
                    row(title: question.title, subtitle: question.categoryLabel, systemImage: "questionmark.bubble") { open(question) }
                }
            } else {
                let groups = QuestionsAndAnswers.categories(questions.rows)
                if groups.isEmpty { EmptyStateBox(text: questions.isLoading ? "読み込み中…" : "まだ質問がありません。") }
                ForEach(groups, id: \.name) { group in
                    row(title: group.name, subtitle: "質問 \(group.count)件", systemImage: "folder") { category = group.name }
                }
            }
        }
    }

    private var askForm: some View {
        VStack(alignment: .leading, spacing: 12) {
            FormField(label: "カテゴリー") {
                HStack(spacing: 8) {
                    BoxedTextField(placeholder: "", text: $askCategory)
                    let options = QuestionsAndAnswers.categoryOptions(questions.rows)
                    if !options.isEmpty {
                        Menu {
                            ForEach(options, id: \.self) { name in Button(name) { askCategory = name } }
                        } label: { Image(systemName: "list.bullet") }
                            .accessibilityLabel("既存のカテゴリーから選ぶ")
                    }
                }
            }
            FormField(label: "質問タイトル") { BoxedTextField(placeholder: "", text: $askTitle) }
            FormField(label: "質問内容") { MemoEditor(placeholder: "", text: $askBody, minLines: 4) }
            Button("質問する") {
                Task {
                    try? await QARepository.ask(category: askCategory, title: askTitle, body: askBody)
                    await questions.refresh()
                    asking = false
                }
            }
            .buttonStyle(PillButtonStyle(kind: .secondary))
            .disabled(!QuestionsAndAnswers.canAsk(title: askTitle))
            .opacity(QuestionsAndAnswers.canAsk(title: askTitle) ? 1 : 0.4)
        }
        .padding(20)
        .card(radius: Radius.card)
    }

    private func titles(_ category: String) -> some View {
        TabPage {
            BackHeader(label: "カテゴリーへ戻る", variant: .subtle) { self.category = nil }
            PageHeading(title: category)
            ForEach(QuestionsAndAnswers.questions(in: category, questions.rows)) { question in
                let count = QuestionsAndAnswers.answers(for: question.id, answers.rows).count
                row(title: question.title, subtitle: count > 0 ? "回答 \(count)件" : "未回答", systemImage: "questionmark.bubble") { open(question) }
            }
        }
    }

    private func detail(_ question: QAQuestionRow) -> some View {
        let questionAnswers = QuestionsAndAnswers.answers(for: question.id, answers.rows)
        return TabPage {
            BackHeader(label: category ?? "戻る", variant: .subtle) {
                questionID = nil
                confirmDeleteQuestion = false
            }
            VStack(alignment: .leading, spacing: 8) {
                Text(question.categoryLabel).appFont(12, weight: .semibold).foregroundStyle(Color.primary)
                    .padding(.horizontal, 12).padding(.vertical, 4).background(Color.primary.opacity(0.1), in: Capsule())
                Text(question.title).appFont(16, weight: .bold).foregroundStyle(Color.appForeground)
                if !question.body.isEmpty {
                    Text(question.body).appFont(14).foregroundStyle(Color.appForeground).lineSpacing(4)
                }
                if canEdit {
                    if confirmDeleteQuestion {
                        ConfirmDeleteInline(message: "この質問と回答をすべて削除しますか？", onConfirm: {
                            Task {
                                try? await QARepository.deleteQuestion(id: question.id)
                                confirmDeleteQuestion = false
                                questionID = nil
                                await questions.refresh()
                                await answers.refresh()
                            }
                        }, onCancel: { confirmDeleteQuestion = false })
                    } else {
                        Button("質問を削除") { confirmDeleteQuestion = true }
                            .appFont(12, weight: .semibold).foregroundStyle(Color.destructive)
                            .frame(maxWidth: .infinity, alignment: .trailing)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(20)
            .card()

            HStack {
                Text("アンサー\(questionAnswers.isEmpty ? "" : " (\(questionAnswers.count))")").appFont(14, weight: .bold).foregroundStyle(Color.appForeground)
                Spacer()
                if canEdit {
                    Button {
                        answering.toggle()
                        answerBody = ""; responder = ""
                    } label: { Label(answering ? "閉じる" : "回答を追加", systemImage: answering ? "xmark" : "plus") }
                        .buttonStyle(PillButtonStyle(kind: .outline)).fixedSize()
                }
            }
            if canEdit && answering {
                VStack(alignment: .leading, spacing: 10) {
                    MemoEditor(placeholder: "回答内容", text: $answerBody, minLines: 4)
                    BoxedTextField(placeholder: "回答者の名前", text: $responder)
                    Button("回答する") {
                        Task {
                            try? await QARepository.answer(questionID: question.id, responder: responder, body: answerBody)
                            await answers.refresh()
                            answering = false
                        }
                    }
                    .buttonStyle(PillButtonStyle())
                    .disabled(!QuestionsAndAnswers.canAnswer(responder: responder, body: answerBody))
                    .opacity(QuestionsAndAnswers.canAnswer(responder: responder, body: answerBody) ? 1 : 0.4)
                }
                .padding(16)
                .card(fill: .appBackground)
            }
            if questionAnswers.isEmpty {
                Text("まだ回答がありません。").appFont(14).foregroundStyle(Color.mutedForeground)
            }
            ForEach(questionAnswers) { answer in
                VStack(alignment: .leading, spacing: 6) {
                    if !answer.title.isEmpty {
                        Text(answer.title).appFont(14, weight: .semibold).foregroundStyle(Color.appForeground)
                    }
                    Text(answer.body).appFont(14).foregroundStyle(Color.appForeground).lineSpacing(4)
                    HStack(spacing: 8) {
                        Spacer()
                        Text(answer.responder).appFont(12, weight: .semibold).foregroundStyle(Color.primary)
                        if canEdit {
                            Button { confirmDeleteAnswerID = answer.id } label: { Image(systemName: "trash").font(.system(size: 12)) }
                                .buttonStyle(.plain).foregroundStyle(Color.mutedForeground.opacity(0.6))
                                .accessibilityLabel("\(answer.responder)の回答を削除")
                        }
                    }
                    if confirmDeleteAnswerID == answer.id {
                        ConfirmDeleteInline(onConfirm: {
                            Task {
                                try? await QARepository.deleteAnswer(id: answer.id)
                                confirmDeleteAnswerID = nil
                                await answers.refresh()
                            }
                        }, onCancel: { confirmDeleteAnswerID = nil })
                    }
                }
                .padding(16)
                .card()
            }
        }
    }

    private func open(_ question: QAQuestionRow) {
        questionID = question.id
        category = category ?? question.categoryLabel
        confirmDeleteQuestion = false
        answering = false
    }

    private func row(title: String, subtitle: String, systemImage: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: systemImage).foregroundStyle(Color.primary)
                    .frame(width: 40, height: 40).background(Color.primary.opacity(0.15), in: RoundedRectangle(cornerRadius: 12))
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).appFont(16, weight: .semibold).foregroundStyle(Color.appForeground).lineLimit(1)
                    Text(subtitle).appFont(12).foregroundStyle(Color.mutedForeground)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").foregroundStyle(Color.mutedForeground)
            }
            .padding(.horizontal, 20).padding(.vertical, 16).card()
        }
        .buttonStyle(.plain)
    }
}
