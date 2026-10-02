import KyoeiCore
import Supabase
import SwiftUI

enum SelfReviewRepository {
    static func mine() async throws -> MySelfReview {
        try await Backend.client.rpc("my_self_review").execute().value
    }

    static func subordinates() async throws -> SubordinateReviews {
        try await Backend.client.rpc("my_subordinate_reviews").execute().value
    }

    struct Submission: Encodable {
        let p_purpose: String
        let p_self_scores: [Int]
        let p_goals: [String]
        let p_reflections: [String]
        let p_missing_days: [String]
        let p_vehicle_class: String?
    }

    static func submit(_ submission: Submission) async throws {
        try await Backend.client.rpc("submit_self_review", params: submission).execute()
    }

    struct Scores: Encodable {
        let p_user: String
        let p_scores: [Int]
    }

    static func score(user: String, scores: [Int]) async throws {
        try await Backend.client.rpc("score_subordinate_review", params: Scores(p_user: user, p_scores: scores)).execute()
    }
}

/// マイページ > 自己評価・目標設定シート: my sheet for last month and, for a
/// 上長, the 上長採点 of the people assigned to them.
struct SelfReviewView: View {
    @State private var tab: Tab = .mine
    @State private var subordinates: SubordinateReviews?

    private enum Tab: Hashable { case mine, team }

    var body: some View {
        TabPage {
            PageHeading(title: "自己評価・目標設定シート", subtitle: "毎月15日までに、先月分を提出してください。")
            if let subordinates, !subordinates.people.isEmpty {
                Picker("表示", selection: $tab) {
                    Text("自分のシート").tag(Tab.mine)
                    Text("上長採点（\(subordinates.people.count)人）").tag(Tab.team)
                }
                .pickerStyle(.segmented)
            }
            switch tab {
            case .mine: MySelfReviewSection()
            case .team:
                if let subordinates {
                    TeamReviewSection(data: subordinates) { await loadTeam() }
                }
            }
        }
        .task { await loadTeam() }
    }

    private func loadTeam() async {
        if let fresh = try? await SelfReviewRepository.subordinates() { subordinates = fresh }
    }
}

// MARK: - My sheet

private struct MySelfReviewSection: View {
    @Environment(InspectionStore.self) private var inspections
    @Environment(SharedData.self) private var data
    @State private var overrides = RealtimeTable<AttendanceOverrideRow>(table: "attendance_day_overrides", fetch: AttendanceOverrideRepository.fetch)
    @State private var sheet: MySelfReview?
    @State private var loadFailed = false
    @State private var purpose = ""
    @State private var scores: [Int?] = Array(repeating: nil, count: 10)
    @State private var goals = Array(repeating: "", count: 4)
    @State private var reflections = Array(repeating: "", count: 4)
    @State private var sending = false
    @State private var message: String?
    @State private var sent = false

    var body: some View {
        Group {
            if let sheet {
                content(sheet)
            } else if loadFailed {
                EmptyStateBox(text: "読み込めませんでした。通信状況を確認してください。")
            } else {
                ProgressView().frame(maxWidth: .infinity, minHeight: 160)
            }
        }
        .syncing(overrides)
        .task { await load() }
    }

    private var vehicleClassLabel: String {
        inspections.profile?.vehicle_class?.label ?? "未設定"
    }

    private var missingDays: [LocalDate] {
        guard let sheet else { return [] }
        let resolved = AttendanceCalendar.resolve(trips: data.trips, overrides: overrides.rows)
        let workdays = Set(resolved.filter { $0.value.showsMark }.keys)
        return SelfReviewRules.missingInspectionDays(period: sheet.period, workdays: workdays, inspected: Set(inspections.records.map(\.inspected_on)))
    }

    @ViewBuilder private func content(_ sheet: MySelfReview) -> some View {
        headerCard(sheet)
        resultCard(sheet)
        if sheet.is_open {
            editor(sheet)
        } else if let review = sheet.review {
            ReviewAnswersView(template: sheet.template, goalTitle: sheet.goalTitle, reflectionTitle: sheet.reflectionTitle,
                              purpose: review.purpose, scores: review.self_scores, goals: review.goals, reflections: review.reflections)
        } else {
            EmptyStateBox(text: "\(sheet.title)は提出されていません。提出期間は毎月1日〜\(sheet.template.deadline_day)日です。")
        }
    }

    private func headerCard(_ sheet: MySelfReview) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(sheet.title).appFont(20, weight: .black).foregroundStyle(Color.appForeground)
                Spacer()
                if let deadline = sheet.deadline {
                    Text("提出期限 \(deadline.month)月\(deadline.day)日").appFont(13, weight: .bold)
                        .foregroundStyle(sheet.is_open ? Color.secondary : Color.mutedForeground)
                }
            }
            HStack {
                Text("担当車格").appFont(12).foregroundStyle(Color.mutedForeground)
                Text(sheet.review?.vehicle_class.flatMap(VehicleClass.init(rawValue:))?.label ?? vehicleClassLabel)
                    .appFont(14, weight: .semibold).foregroundStyle(Color.appForeground)
            }
            if sheet.review?.submitted_at != nil {
                Label(sheet.is_open ? "提出済み（期限まで修正できます）" : "提出済み", systemImage: "checkmark.circle.fill")
                    .appFont(13, weight: .bold).foregroundStyle(Color.primary)
            } else if sheet.is_open {
                Label("まだ提出していません", systemImage: "exclamationmark.circle.fill")
                    .appFont(13, weight: .bold).foregroundStyle(Color.secondary)
            }
        }
        .padding(16)
        .card()
    }

    @ViewBuilder private func resultCard(_ sheet: MySelfReview) -> some View {
        switch sheet.result.status {
        case .final:
            HStack(spacing: 10) {
                resultTile("合計点", sheet.result.total.map { "\($0)点" } ?? "－")
                resultTile("プロドライバー手当", sheet.result.allowance.map { "\($0.formatted())円" } ?? "－")
            }
        case .excluded:
            Text("日常点検の記録がない出勤日があるため、得点を計算していません。事務所の確認をお待ちください。")
                .appFont(13, weight: .semibold).foregroundStyle(Color.destructive)
                .padding(14).frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.destructive.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
        case .pending:
            if sheet.review != nil {
                Text("上長と社長の採点が終わると、合計点と手当額が表示されます。")
                    .appFont(12).foregroundStyle(Color.mutedForeground)
            }
        }
    }

    private func resultTile(_ title: String, _ value: String) -> some View {
        VStack(spacing: 4) {
            Text(title).appFont(12, weight: .semibold).foregroundStyle(Color.mutedForeground)
            Text(value).appFont(22, weight: .black).monospacedDigit().foregroundStyle(Color.primary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .card(border: Color.primary.opacity(0.5))
    }

    @ViewBuilder private func editor(_ sheet: MySelfReview) -> some View {
        let template = sheet.template
        VStack(alignment: .leading, spacing: 8) {
            Text("項目0").appFont(12, weight: .bold).foregroundStyle(Color.mutedForeground)
            StyledTextView(raw: template.purpose_question).appFont(16, weight: .bold).foregroundStyle(Color.appForeground)
            multiline("例：家族のため、仲間と一緒に成長するため", text: $purpose)
        }
        .padding(16)
        .card()

        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("チェック項目（自己採点）").appFont(15, weight: .bold).foregroundStyle(Color.appForeground)
                Spacer()
                Text("\(SelfReviewRules.subtotal(scores))/30点").appFont(15, weight: .black).monospacedDigit().foregroundStyle(Color.primary)
            }
            Text("◎ いつも完璧 3　○ ほとんど完璧 2　△ 半分くらいは出来た 1　× ほとんど出来ない 0")
                .appFont(11).foregroundStyle(Color.mutedForeground)
            ForEach(0..<10, id: \.self) { index in
                ScoreRow(number: index + 1, text: template.items[safe: index] ?? "", value: $scores[index])
            }
        }
        .padding(16)
        .card()

        questionCard(sheet.goalTitle, questions: template.goal_questions, answers: $goals)
        questionCard(sheet.reflectionTitle, questions: template.reflection_questions, answers: $reflections)

        let missing = missingDays
        if !missing.isEmpty {
            VStack(alignment: .leading, spacing: 4) {
                Label("日常点検の記録がない出勤日があります", systemImage: "exclamationmark.triangle.fill")
                    .appFont(13, weight: .bold).foregroundStyle(Color.destructive)
                Text(missing.map { "\($0.month)/\($0.day)" }.joined(separator: "、")).appFont(13, weight: .semibold).monospacedDigit()
                Text("このまま提出すると、得点は計算されません（事務所の確認後に計算される場合があります）。点検簿と運行履歴を確認してください。")
                    .appFont(12).foregroundStyle(Color.mutedForeground)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.destructive.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
        }

        if let message {
            Text(message).appFont(13, weight: .semibold).foregroundStyle(sent ? Color.primary : Color.destructive)
        }
        Button(sending ? "送信中…" : (sheet.review == nil ? "提出する" : "修正して提出する")) { submit(sheet) }
            .buttonStyle(PillButtonStyle())
            .disabled(sending)
    }

    private func questionCard(_ title: String, questions: [String], answers: Binding<[String]>) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title).appFont(15, weight: .bold).foregroundStyle(Color.appForeground)
            ForEach(0..<4, id: \.self) { index in
                VStack(alignment: .leading, spacing: 6) {
                    StyledTextView(raw: "\(index + 1). \(questions[safe: index] ?? "")").appFont(13, weight: .semibold).foregroundStyle(Color.appForeground)
                    multiline("", text: answers[index])
                }
            }
        }
        .padding(16)
        .card()
    }

    private func multiline(_ placeholder: String, text: Binding<String>) -> some View {
        TextField(placeholder, text: text, axis: .vertical)
            .lineLimit(2...6)
            .appFont(15)
            .padding(12)
            .card(radius: 12, fill: .appBackground)
    }

    private func load() async {
        do {
            let fresh = try await SelfReviewRepository.mine()
            sheet = fresh
            if let review = fresh.review {
                purpose = review.purpose
                scores = (0..<10).map { review.self_scores[safe: $0] }
                goals = (0..<4).map { review.goals[safe: $0] ?? "" }
                reflections = (0..<4).map { review.reflections[safe: $0] ?? "" }
            }
            loadFailed = false
        } catch {
            loadFailed = true
        }
    }

    private func submit(_ sheet: MySelfReview) {
        message = nil
        sent = false
        if let problem = SelfReviewRules.problem(purpose: purpose, scores: scores, goals: goals, reflections: reflections) {
            message = problem
            return
        }
        sending = true
        let submission = SelfReviewRepository.Submission(
            p_purpose: purpose, p_self_scores: scores.compactMap { $0 }, p_goals: goals, p_reflections: reflections,
            p_missing_days: missingDays.map(\.iso), p_vehicle_class: inspections.profile?.vehicle_class?.rawValue
        )
        Task {
            do {
                try await SelfReviewRepository.submit(submission)
                await load()
                sent = true
                message = "提出しました。"
            } catch {
                message = "提出できませんでした。提出期限と通信状況を確認してください。"
            }
            sending = false
        }
    }
}

/// One item with ◎○△× buttons. `selfScore` shows the driver's own mark to a 上長.
private struct ScoreRow: View {
    let number: Int
    let text: String
    @Binding var value: Int?
    var selfScore: Int?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 8) {
                Text("項目\(number)").appFont(11, weight: .bold).foregroundStyle(Color.mutedForeground).frame(width: 44, alignment: .leading)
                StyledTextView(raw: text).appFont(14, weight: .semibold).foregroundStyle(Color.appForeground)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            HStack(spacing: 6) {
                ForEach(ReviewMark.allCases, id: \.self) { mark in
                    let selected = value == mark.rawValue
                    Button { value = mark.rawValue } label: {
                        VStack(spacing: 0) {
                            Text(mark.symbol).appFont(18, weight: .black)
                            Text("\(mark.rawValue)").appFont(10, weight: .semibold)
                        }
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .foregroundStyle(selected ? Color.brandForeground : Color.appForeground)
                        .background(selected ? Color.brand : Color.appBackground, in: RoundedRectangle(cornerRadius: 10))
                        .overlay(RoundedRectangle(cornerRadius: 10).stroke(selected ? Color.brand : Color.border))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("項目\(number) \(mark.label) \(mark.rawValue)点")
                }
                if let selfScore, let mark = ReviewMark(rawValue: selfScore) {
                    VStack(spacing: 0) {
                        Text("本人").appFont(9).foregroundStyle(Color.mutedForeground)
                        Text(mark.symbol).appFont(16, weight: .bold).foregroundStyle(Color.mutedForeground)
                    }
                    .frame(width: 36)
                }
            }
        }
        .padding(.vertical, 4)
    }
}

/// Read-only answers (after the deadline, or for a 上長).
private struct ReviewAnswersView: View {
    let template: ReviewTemplate
    let goalTitle: String
    let reflectionTitle: String
    let purpose: String
    let scores: [Int]?
    let goals: [String]
    let reflections: [String]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            StyledTextView(raw: template.purpose_question).appFont(13, weight: .bold).foregroundStyle(Color.mutedForeground)
            Text(purpose.isEmpty ? "（未記入）" : purpose).appFont(15).foregroundStyle(Color.appForeground)
            if let scores {
                Divider()
                ForEach(0..<10, id: \.self) { index in
                    HStack(alignment: .top) {
                        StyledTextView(raw: "\(index + 1). \(template.items[safe: index] ?? "")").appFont(12).foregroundStyle(Color.appForeground)
                        Spacer(minLength: 8)
                        Text(scores[safe: index].flatMap(ReviewMark.init(rawValue:))?.symbol ?? "－").appFont(15, weight: .black)
                    }
                }
                Text("自己採点 \(scores.reduce(0, +))/30点").appFont(13, weight: .bold).foregroundStyle(Color.primary)
            }
            Divider()
            answers(goalTitle, template.goal_questions, goals)
            answers(reflectionTitle, template.reflection_questions, reflections)
        }
        .padding(16)
        .card()
    }

    private func answers(_ title: String, _ questions: [String], _ values: [String]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).appFont(13, weight: .bold).foregroundStyle(Color.appForeground)
            ForEach(0..<4, id: \.self) { index in
                StyledTextView(raw: "\(index + 1). \(questions[safe: index] ?? "")").appFont(12).foregroundStyle(Color.mutedForeground)
                Text((values[safe: index] ?? "").isEmpty ? "（未記入）" : values[index]).appFont(14).foregroundStyle(Color.appForeground)
            }
        }
    }
}

// MARK: - 上長採点

private struct TeamReviewSection: View {
    let data: SubordinateReviews
    let reload: () async -> Void
    @State private var open: SubordinateReview?

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("\(data.period.month)月分の上長採点").appFont(16, weight: .bold).foregroundStyle(Color.appForeground)
            Text(data.is_open ? "採点期限 \(data.deadline.month)月\(data.deadline.day)日" : "採点期限を過ぎました（\(data.deadline.month)月\(data.deadline.day)日）")
                .appFont(12).foregroundStyle(data.is_open ? Color.secondary : Color.mutedForeground)
        }
        ForEach(data.people) { person in
            Button { open = person } label: {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(person.name).appFont(16, weight: .bold).foregroundStyle(Color.appForeground)
                        Text(person.vehicle_class.flatMap(VehicleClass.init(rawValue:))?.label ?? "車格未設定").appFont(12).foregroundStyle(Color.mutedForeground)
                    }
                    Spacer()
                    Chip(text: person.my_scores != nil ? "採点済み" : (person.submitted_at != nil ? "提出済み・未採点" : "本人未提出"),
                         style: person.my_scores != nil ? .green : (person.submitted_at != nil ? .amber : .gray))
                    Image(systemName: "chevron.right").foregroundStyle(Color.mutedForeground)
                }
                .padding(14)
                .card()
            }
            .buttonStyle(.plain)
        }
        .sheet(item: $open) { person in
            SupervisorScoreSheet(data: data, person: person) {
                open = nil
                Task { await reload() }
            }
        }
    }
}

private struct SupervisorScoreSheet: View {
    let data: SubordinateReviews
    let person: SubordinateReview
    let onDone: () -> Void
    @State private var scores: [Int?] = Array(repeating: nil, count: 10)
    @State private var saving = false
    @State private var message: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Text("\(person.name)さん・\(data.period.month)月分").appFont(18, weight: .bold)
                    Spacer()
                    Button("閉じる", action: onDone).appFont(15, weight: .semibold).foregroundStyle(Color.primary)
                }
                if person.submitted_at == nil {
                    Text("本人はまだ提出していません。先に上長採点だけ入力することもできます。").appFont(12).foregroundStyle(Color.secondary)
                }
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Text("上長採点").appFont(15, weight: .bold)
                        Spacer()
                        Text("\(SelfReviewRules.subtotal(scores))/30点").appFont(15, weight: .black).monospacedDigit().foregroundStyle(Color.primary)
                    }
                    ForEach(0..<10, id: \.self) { index in
                        ScoreRow(number: index + 1, text: data.template.items[safe: index] ?? "", value: $scores[index], selfScore: person.self_scores?[safe: index])
                    }
                    if let message {
                        Text(message).appFont(13, weight: .semibold).foregroundStyle(Color.destructive)
                    }
                    if data.is_open {
                        Button(saving ? "保存中…" : "上長採点を保存") { save() }
                            .buttonStyle(PillButtonStyle())
                            .disabled(saving)
                    }
                }
                .padding(16)
                .card()
                if person.submitted_at != nil {
                    ReviewAnswersView(template: data.template,
                                      goalTitle: "翌月の目標", reflectionTitle: "\(data.period.month)月の反省や良かった事",
                                      purpose: person.purpose ?? "", scores: nil,
                                      goals: person.goals ?? [], reflections: person.reflections ?? [])
                }
            }
            .padding(20)
        }
        .background(Color.appBackground.ignoresSafeArea())
        .onAppear { scores = (0..<10).map { person.my_scores?[safe: $0] } }
    }

    private func save() {
        guard scores.allSatisfy({ $0 != nil }) else {
            message = "項目1〜10をすべて採点してください。"
            return
        }
        saving = true
        Task {
            do {
                try await SelfReviewRepository.score(user: person.user_id, scores: scores.compactMap { $0 })
                onDone()
            } catch {
                message = "保存できませんでした。採点期限と通信状況を確認してください。"
            }
            saving = false
        }
    }
}
