import KyoeiCore
import Supabase
import SwiftUI

enum StaffLinkRepository {
    static func fetch() async throws -> [StaffProfileRow] {
        try await Backend.client.from("staff_members").select(StaffProfileRow.selectColumns).execute().value
    }
}

/// マイページ: the signed-in account (login ID, roles), its 出勤簿 profile
/// (名前・入社年月日・勤続年数) and the personal features. The link between the
/// account and its 出勤簿 name is set by an administrator when inviting.
/// Port of components/mypage-view.tsx.
struct MyPageView: View {
    @Environment(AuthStore.self) private var auth
    @State private var profiles = RealtimeTable<StaffProfileRow>(table: "staff_members", fetch: StaffLinkRepository.fetch)
    @State private var selected: MyPageItem?

    var body: some View {
        let userID = auth.userID ?? ""
        let me = StaffLink.me(userID: userID, in: profiles.rows)
        Group {
            if let selected, let me {
                feature(selected, me: me, userID: userID)
            } else {
                home(me)
            }
        }
        .syncing(profiles)
    }

    private var heading: some View {
        PageHeading(title: "マイページ", subtitle: "ご自身のアカウントと、名前・入社年月日・勤続年数を確認できます。")
    }

    private func home(_ me: StaffProfileRow?) -> some View {
        TabPage {
            heading
            VStack(alignment: .leading, spacing: 16) {
                HStack(spacing: 12) {
                    Image(systemName: "person.text.rectangle").foregroundStyle(Color.primary)
                        .frame(width: 44, height: 44).background(Color.primary.opacity(0.15), in: Circle())
                    VStack(alignment: .leading, spacing: 2) {
                        Text(me?.name ?? "（出勤簿の名前が未設定）").appFont(18, weight: .bold).foregroundStyle(Color.appForeground)
                        if let label = auth.loginLabel {
                            Text("ログインID：\(label)").appFont(12).foregroundStyle(Color.mutedForeground)
                        }
                    }
                }
                Divider()
                profileRow("入社年月日", formatHireDate(me?.hireDate) ?? "未登録")
                profileRow("勤続年数", Tenure(hireDate: me?.hireDate)?.label ?? "未登録")
                if let roles = auth.account?.roleLabel, !roles.isEmpty {
                    profileRow("権限", roles)
                }
            }
            .padding(20)
            .card()
            if me == nil && !profiles.isLoading {
                Text("出勤簿の名前がまだ紐付いていません。管理者に紐付けを依頼すると、配車表などの機能が使えるようになります。")
                    .appFont(13, weight: .semibold).foregroundStyle(Color.secondary)
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.secondary.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
            }
            ForEach(MyPageItem.allCases, id: \.self) { item in
                Button { selected = item } label: {
                    HStack(spacing: 12) {
                        Image(systemName: item.systemImage).foregroundStyle(Color.primary)
                            .frame(width: 40, height: 40).background(Color.primary.opacity(0.15), in: RoundedRectangle(cornerRadius: 12))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.label).appFont(16, weight: .semibold).foregroundStyle(Color.appForeground)
                            Text(item.summary).appFont(12).foregroundStyle(Color.mutedForeground)
                        }
                        Spacer(minLength: 0)
                        Image(systemName: "chevron.right").foregroundStyle(Color.mutedForeground)
                    }
                    .padding(.horizontal, 20).padding(.vertical, 16).card()
                }
                .buttonStyle(.plain)
                .disabled(me == nil)
                .opacity(me == nil ? 0.5 : 1)
            }
            signOutButton
        }
    }

    @ViewBuilder private func feature(_ item: MyPageItem, me: StaffProfileRow, userID: String) -> some View {
        VStack(spacing: 0) {
            BackHeader(label: "マイページへ戻る", variant: .subtle) { selected = nil }
                .padding(.horizontal, 16)
                .frame(maxWidth: 448)
                .frame(maxWidth: .infinity)
            switch item {
            case .tripHistory:
                TripHistoryView()
            case .dispatchSheet:
                DispatchSheetView(staffID: me.id, staffName: me.name, userID: userID)
            default:
                TabPage {
                    VStack(spacing: 8) {
                        Text(item.label).appFont(18, weight: .bold).foregroundStyle(Color.appForeground)
                        Text(item.summary).appFont(14).foregroundStyle(Color.mutedForeground)
                        Text("準備中です").appFont(14, weight: .semibold).foregroundStyle(Color.primary).padding(.top, 8)
                    }
                    .frame(maxWidth: .infinity, minHeight: 200)
                    .card()
                }
            }
        }
    }

    private func profileRow(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label).appFont(14).foregroundStyle(Color.mutedForeground)
            Spacer()
            Text(value).appFont(14, weight: .semibold).foregroundStyle(Color.appForeground)
        }
    }

    private var signOutButton: some View {
        Button { Task { await auth.signOut() } } label: {
            Label("ログアウト", systemImage: "rectangle.portrait.and.arrow.right")
        }
        .buttonStyle(PillButtonStyle(kind: .outline))
    }
}

extension MyPageItem {
    var systemImage: String {
        switch self {
        case .dispatchSheet: "doc.text"
        case .tripHistory: "clock.arrow.circlepath"
        case .inspection: "checklist"
        case .selfEvaluation: "list.clipboard"
        case .awardVote: "rosette"
        case .leaveRequest: "calendar.badge.minus"
        case .repairRequest: "wrench.and.screwdriver"
        case .packagingHistory: "shippingbox"
        }
    }
}
