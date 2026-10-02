import KyoeiCore
import Supabase
import SwiftUI

enum AwardRepository {
    static func status() async throws -> AwardStatus {
        let rows: [AwardVoteRow] = try await Backend.client.rpc("my_award_votes").execute().value
        return AwardStatus(rows: rows)
    }

    static func candidates() async throws -> [AwardCandidate] {
        try await Backend.client.rpc("award_candidates").execute().value
    }

    static func submit(_ votes: [AwardVote]) async throws {
        try await Backend.client.rpc("submit_award_votes", params: ["p_votes": AwardBallot.payload(votes)]).execute()
    }
}

/// 社長賞投票: three people who did well last month and what they did.
/// Open 1〜15日; votes can be changed until the 15th. Anonymous.
struct AwardVoteView: View {
    /// Set when shown full screen (the 帰庫 reminder).
    var onClose: (() -> Void)?

    @Environment(AuthStore.self) private var auth
    @State private var status: AwardStatus?
    @State private var candidates: [AwardCandidate] = []
    @State private var slots: [AwardVote?] = [nil, nil, nil]
    @State private var picking: Int?
    @State private var loadFailed = false
    @State private var sending = false
    @State private var message: String?
    @State private var sent = false

    private var required: Int { min(3, candidates.count) }

    var body: some View {
        VStack(spacing: 0) {
            if let onClose {
                HStack {
                    Spacer()
                    Button("閉じる", action: onClose).appFont(15, weight: .semibold).foregroundStyle(Color.primary)
                }
                .padding(.horizontal, 16).padding(.top, 12)
            }
            TabPage {
                PageHeading(title: status?.title ?? "社長賞投票", subtitle: "先月頑張った3人と、頑張ったことを入力してください。")
                if let status {
                    windowCard(status)
                    if status.isOpen {
                        ForEach(0..<max(required, 1), id: \.self) { index in slot(index) }
                        if let message {
                            Text(message).appFont(13, weight: .semibold).foregroundStyle(sent ? Color.primary : Color.destructive)
                        }
                        Button(sending ? "送信中…" : (status.hasVoted ? "投票を更新する" : "投票する")) { submit() }
                            .buttonStyle(PillButtonStyle())
                            .disabled(sending || required == 0)
                    } else if status.hasVoted {
                        ForEach(Array(status.votes.enumerated()), id: \.offset) { index, vote in
                            readOnly(index, vote)
                        }
                    }
                    anonymityNote
                } else if loadFailed {
                    EmptyStateBox(text: "読み込めませんでした。通信状況を確認してください。")
                } else {
                    ProgressView().frame(maxWidth: .infinity, minHeight: 160)
                }
            }
        }
        .background(Color.appBackground.ignoresSafeArea())
        .task { await load() }
        .sheet(item: Binding(get: { picking.map(PickingSlot.init) }, set: { picking = $0?.index })) { slot in
            AwardPersonPicker(
                candidates: candidates,
                taken: Set(slots.enumerated().compactMap { $0.offset == slot.index ? nil : $0.element?.nominee }),
                onPick: { person in
                    let reason = slots[slot.index]?.reason ?? ""
                    slots[slot.index] = AwardVote(nominee: person.user_id, nomineeName: person.name, reason: reason)
                    picking = nil
                },
                onCancel: { picking = nil }
            )
        }
    }

    private struct PickingSlot: Identifiable {
        let index: Int
        var id: Int { index }
    }

    private func windowCard(_ status: AwardStatus) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("投票期間：\(status.closesOn.month)月1日〜\(status.closesOn.day)日")
                .appFont(14, weight: .bold).foregroundStyle(Color.appForeground)
            Text(status.isOpen
                 ? (status.hasVoted ? "投票済みです。\(status.closesOn.month)月\(status.closesOn.day)日まで内容を変更できます。" : "まだ投票していません。")
                 : (status.hasVoted ? "投票期間は終わりました。あなたの投票内容です。" : "投票期間外です。毎月1日〜15日に投票できます。"))
                .appFont(13).foregroundStyle(status.isOpen && !status.hasVoted ? Color.secondary : Color.mutedForeground)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .card()
    }

    private func slot(_ index: Int) -> some View {
        let vote = slots.indices.contains(index) ? slots[index] : nil
        return VStack(alignment: .leading, spacing: 10) {
            Text("\(index + 1)人目").appFont(12, weight: .bold).foregroundStyle(Color.mutedForeground)
            Button { picking = index } label: {
                HStack {
                    Image(systemName: vote == nil ? "person.crop.circle.badge.plus" : "person.crop.circle.fill")
                        .font(.system(size: 22)).foregroundStyle(Color.primary)
                    Text(vote?.nomineeName ?? "選ぶ").appFont(17, weight: .bold)
                        .foregroundStyle(vote == nil ? Color.mutedForeground : Color.appForeground)
                    Spacer()
                    Image(systemName: "chevron.right").foregroundStyle(Color.mutedForeground)
                }
                .padding(12)
                .background(Color.appBackground, in: RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(.plain)
            FormField(label: "頑張ったこと") {
                TextField("例：新人の積み込みを毎日手伝ってくれた", text: Binding(
                    get: { slots[index]?.reason ?? "" },
                    set: { text in
                        if slots[index] != nil { slots[index]?.reason = text }
                    }
                ), axis: .vertical)
                .lineLimit(2...6)
                .appFont(15)
                .padding(12)
                .card(radius: 12, fill: .appBackground)
                .disabled(vote == nil)
            }
        }
        .padding(14)
        .card()
    }

    private func readOnly(_ index: Int, _ vote: AwardVote) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("\(index + 1)人目").appFont(12, weight: .bold).foregroundStyle(Color.mutedForeground)
            Text(vote.nomineeName).appFont(17, weight: .bold).foregroundStyle(Color.appForeground)
            Text(vote.reason).appFont(14).foregroundStyle(Color.appForeground)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .card()
    }

    private var anonymityNote: some View {
        VStack(alignment: .leading, spacing: 4) {
            Label("投票は匿名です", systemImage: "lock.fill").appFont(13, weight: .bold).foregroundStyle(Color.appForeground)
            Text("誰が誰に投票したかは、管理者を含めて誰にも表示されません。誹謗中傷など問題のある投票に限り、管理者2人の合意で投票者を確認することがあります（記録が残ります）。投票者の記録は1年後に削除されます。")
                .appFont(12).foregroundStyle(Color.mutedForeground)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.muted, in: RoundedRectangle(cornerRadius: 12))
    }

    private func load() async {
        do {
            async let fresh = AwardRepository.status()
            async let people = AwardRepository.candidates()
            let (s, c) = try await (fresh, people)
            status = s
            candidates = c
            slots = (0..<3).map { s.votes.indices.contains($0) ? s.votes[$0] : nil }
            loadFailed = false
        } catch {
            loadFailed = true
        }
    }

    private func submit() {
        message = nil
        sent = false
        if let problem = AwardBallot.problem(slots, required: required, me: auth.userID) {
            message = problem
            return
        }
        sending = true
        let votes = slots.prefix(required).compactMap { $0 }
        Task {
            do {
                try await AwardRepository.submit(votes)
                await load()
                sent = true
                message = "投票しました。ありがとうございました。"
                if let onClose {
                    try? await Task.sleep(for: .seconds(1))
                    onClose()
                }
            } catch {
                message = "送信できませんでした。投票期間（1日〜15日）と通信状況を確認してください。"
            }
            sending = false
        }
    }
}

/// Searchable list of everyone who can be voted for.
private struct AwardPersonPicker: View {
    let candidates: [AwardCandidate]
    let taken: Set<String>
    let onPick: (AwardCandidate) -> Void
    let onCancel: () -> Void
    @State private var query = ""

    var body: some View {
        VStack(spacing: 12) {
            HStack {
                Text("投票する人を選ぶ").appFont(16, weight: .bold)
                Spacer()
                Button("やめる", action: onCancel).appFont(15, weight: .semibold).foregroundStyle(Color.primary)
            }
            BoxedTextField(placeholder: "名前で探す", text: $query, fill: .card)
            ScrollView {
                LazyVStack(spacing: 6) {
                    ForEach(filtered) { person in
                        let isTaken = taken.contains(person.user_id)
                        Button { onPick(person) } label: {
                            HStack {
                                Text(person.name).appFont(16, weight: .semibold)
                                if let position = person.position_name {
                                    Text(position).appFont(12).foregroundStyle(Color.mutedForeground)
                                }
                                Spacer()
                                if isTaken { Text("選択済み").appFont(12).foregroundStyle(Color.mutedForeground) }
                            }
                            .foregroundStyle(isTaken ? Color.mutedForeground : Color.appForeground)
                            .padding(12)
                            .card(radius: 12)
                        }
                        .buttonStyle(.plain)
                        .disabled(isTaken)
                    }
                }
            }
        }
        .padding(16)
        .background(Color.appBackground.ignoresSafeArea())
    }

    private var filtered: [AwardCandidate] {
        let q = query.trimmingCharacters(in: .whitespaces)
        return q.isEmpty ? candidates : candidates.filter { $0.name.localizedStandardContains(q) }
    }
}
