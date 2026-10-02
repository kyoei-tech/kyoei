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
    @Environment(RepairStore.self) private var repairs
    @State private var profiles = RealtimeTable<StaffProfileRow>(table: "staff_members", fetch: StaffLinkRepository.fetch)
    @State private var selected: MyPageItem?
    /// my_profile(): 役職・フルネーム・車格・担当車両・期限 (entered from the admin console).
    @State private var profile: MyProfile?

    var body: some View {
        let userID = auth.userID ?? ""
        let me = StaffLink.me(userID: userID, in: profiles.rows)
        Group {
            if let selected, me != nil || !selected.needsStaffLink {
                feature(selected, me: me, userID: userID)
            } else {
                home(me)
            }
        }
        .syncing(profiles)
        .task { await loadProfile() }
    }

    private func loadProfile() async {
        if let fresh: MyProfile = try? await Backend.client.rpc("my_profile").execute().value {
            profile = fresh
        }
    }

    private var heading: some View {
        PageHeading(title: "マイページ", subtitle: "ご自身の情報と、各種の記録・申請です。")
    }

    private func home(_ me: StaffProfileRow?) -> some View {
        TabPage {
            heading
            ProfileCard(profile: profile, staff: me, loginLabel: auth.loginLabel)
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
                        if item == .repairRequest, !repairs.unread.isEmpty {
                            Text("更新あり").appFont(11, weight: .black).foregroundStyle(Color.destructiveForeground)
                                .padding(.horizontal, 8).padding(.vertical, 3).background(Color.destructive, in: Capsule())
                        }
                        Image(systemName: "chevron.right").foregroundStyle(Color.mutedForeground)
                    }
                    .padding(.horizontal, 20).padding(.vertical, 16).card()
                }
                .buttonStyle(.plain)
                .disabled(me == nil && item.needsStaffLink)
                .opacity(me == nil && item.needsStaffLink ? 0.5 : 1)
            }
            signOutButton
        }
    }

    @ViewBuilder private func feature(_ item: MyPageItem, me: StaffProfileRow?, userID: String) -> some View {
        VStack(spacing: 0) {
            BackHeader(label: "マイページへ戻る", variant: .subtle) { selected = nil }
                .padding(.horizontal, 16)
                .frame(maxWidth: 448)
                .frame(maxWidth: .infinity)
            switch item {
            case .tripHistory:
                TripHistoryView()
            case .dispatchSheet:
                if let me { DispatchSheetView(staffID: me.id, staffName: me.name, userID: userID) }
            case .inspection:
                InspectionLogView()
            case .packagingHistory:
                PackingHistoryView()
            case .redPlates:
                RedPlatesView()
            case .awardVote:
                AwardVoteView()
            case .selfEvaluation:
                SelfReviewView()
            case .repairRequest:
                RepairListView()
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
        case .redPlates: "rectangle.on.rectangle"
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

/// マイページ上部: 権限・名前・入社年月日・勤続年数・担当車格・担当車両・車検期限・
/// 3ヶ月点検・12ヶ月点検・健康診断予定日. Dates near their deadline are highlighted.
private struct ProfileCard: View {
    let profile: MyProfile?
    let staff: StaffProfileRow?
    let loginLabel: String?

    var body: some View {
        let today = LocalDate(Date())
        let hireDate = profile?.hireDate ?? staff?.hireDate
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                Image(systemName: "person.text.rectangle").foregroundStyle(Color.primary)
                    .frame(width: 44, height: 44).background(Color.primary.opacity(0.15), in: Circle())
                VStack(alignment: .leading, spacing: 2) {
                    Text(displayName).appFont(19, weight: .black).foregroundStyle(Color.appForeground)
                    if let loginLabel {
                        Text("ログインID：\(loginLabel)").appFont(12).foregroundStyle(Color.mutedForeground)
                    }
                }
                Spacer(minLength: 0)
                if let position = profile?.position {
                    Text(position)
                        .appFont(12, weight: .heavy)
                        .foregroundStyle(Color.brandForeground)
                        .padding(.horizontal, 12).padding(.vertical, 4)
                        .background(Color.brand, in: SlantedRectangle(slant: 6))
                }
            }
            Divider()
            row("権限", profile?.position ?? "未設定")
            row("入社年月日", formatHireDate(hireDate) ?? "未登録")
            row("勤続年数", Tenure(hireDate: hireDate)?.label ?? "未登録")
            row("担当車格", profile?.vehicle_class?.label ?? "未設定")
            if let vehicles = profile?.vehicles, !vehicles.isEmpty {
                ForEach(vehicles, id: \.plate) { v in
                    VStack(alignment: .leading, spacing: 6) {
                        row(vehicles.count > 1 ? "担当車両（\(v.kindLabel)）" : "担当車両", v.plate, mono: true)
                        dueRow("車検期限", v.shaken_due, today: today)
                        dueRow("3ヶ月点検", v.inspection_3m_due, today: today)
                        dueRow("12ヶ月点検", v.inspection_12m_due, today: today)
                    }
                    .padding(10)
                    .background(Color.appBackground, in: RoundedRectangle(cornerRadius: 12))
                }
            } else {
                row("担当車両", "未定")
            }
            dueRow("健康診断予定日", profile?.health_check_due, today: today)
        }
        .padding(20)
        .card()
    }

    private var displayName: String {
        if let name = profile?.full_name, !name.isEmpty { return name }
        return staff?.name ?? "（名前が未登録）"
    }

    private func row(_ label: String, _ value: String, mono: Bool = false) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(label).appFont(14).foregroundStyle(Color.mutedForeground)
            Spacer(minLength: 8)
            Text(value)
                .appFont(14, weight: .semibold, design: mono ? .monospaced : .default)
                .foregroundStyle(Color.appForeground)
                .multilineTextAlignment(.trailing)
        }
    }

    @ViewBuilder private func dueRow(_ label: String, _ iso: String?, today: LocalDate) -> some View {
        if let due = DueDate(iso: iso, today: today) {
            HStack(alignment: .firstTextBaseline) {
                Text(label).appFont(14).foregroundStyle(Color.mutedForeground)
                Spacer(minLength: 8)
                Text(due.label)
                    .appFont(14, weight: due.status == .ok ? .semibold : .heavy)
                    .foregroundStyle(due.status == .overdue ? Color.destructive : due.status == .soon ? Color.chassisUncheckedText : Color.appForeground)
            }
        } else {
            row(label, "未登録")
        }
    }
}
