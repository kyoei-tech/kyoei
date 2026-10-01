import KyoeiCore
import Supabase
import SwiftUI

enum StaffLinkRepository {
    static func fetch() async throws -> [StaffProfileRow] {
        try await Backend.client.from("staff_members").select(StaffProfileRow.selectColumns).execute().value
    }

    /// Claims an unlinked row for the signed-in user. The null check makes a
    /// row already claimed by someone else a no-op.
    static func link(staffID: String, to userID: String) async throws {
        try await Backend.client.from("staff_members")
            .update(["auth_user_id": userID])
            .eq("id", value: staffID)
            .is("auth_user_id", value: nil)
            .execute()
    }
}

/// マイページ: sign in, link the account to your own 出勤簿 name once, then see
/// your profile and personal features (配車表, 運行履歴, …). Port of
/// components/mypage-view.tsx.
struct MyPageView: View {
    @Environment(AuthStore.self) private var auth
    @State private var profiles = RealtimeTable<StaffProfileRow>(table: "staff_members", fetch: StaffLinkRepository.fetch)
    @State private var selected: MyPageItem?
    @State private var linking = false
    @State private var linkError: String?

    var body: some View {
        Group {
            switch auth.state {
            case .loading:
                TabPage {
                    heading
                    RoundedRectangle(cornerRadius: 16).fill(Color.card.opacity(0.5)).frame(height: 128)
                }
            case .signedOut:
                TabPage {
                    heading
                    AuthForm(description: "マイページを利用するにはアカウント登録が必要です。")
                }
            case .signedIn(let userID, _):
                if let me = StaffLink.me(userID: userID, in: profiles.rows) {
                    if let selected {
                        feature(selected, me: me, userID: userID)
                    } else {
                        home(me)
                    }
                } else {
                    linkPicker(userID: userID)
                }
            }
        }
        .syncing(profiles)
    }

    private var heading: some View {
        PageHeading(title: "マイページ", subtitle: "ご自身の名前・入社年月日・勤続年数を確認できます。")
    }

    private func linkPicker(userID: String) -> some View {
        TabPage {
            heading
            VStack(alignment: .leading, spacing: 10) {
                Text("ご自身の名前を選択してください").appFont(14, weight: .semibold).foregroundStyle(Color.appForeground)
                Text("乗務員一覧から自分の名前を1回だけ選ぶと、次回以降はログインするだけで表示されます。")
                    .appFont(12).foregroundStyle(Color.mutedForeground)
                let unlinked = StaffLink.unlinked(profiles.rows)
                if unlinked.isEmpty && !profiles.isLoading {
                    Text("選択できる乗務員が見つかりませんでした。管理者にご確認ください。").appFont(12).foregroundStyle(Color.mutedForeground)
                }
                ForEach(unlinked) { profile in
                    Button {
                        linking = true
                        linkError = nil
                        Task {
                            defer { linking = false }
                            do {
                                try await StaffLinkRepository.link(staffID: profile.id, to: userID)
                                await profiles.refresh()
                            } catch {
                                linkError = "紐づけに失敗しました。もう一度お試しください。"
                            }
                        }
                    } label: {
                        HStack {
                            Text(profile.name).appFont(14, weight: .semibold).foregroundStyle(Color.appForeground)
                            Spacer()
                            Image(systemName: "chevron.right").foregroundStyle(Color.mutedForeground)
                        }
                        .padding(.horizontal, 16).padding(.vertical, 12).card(fill: .appBackground)
                    }
                    .buttonStyle(.plain)
                    .disabled(linking)
                }
                if let linkError {
                    Text(linkError).appFont(12, weight: .semibold).foregroundStyle(Color.destructive)
                }
            }
            .padding(20)
            .card()
            signOutButton
        }
    }

    private func home(_ me: StaffProfileRow) -> some View {
        TabPage {
            heading
            VStack(alignment: .leading, spacing: 16) {
                HStack(spacing: 12) {
                    Image(systemName: "person.text.rectangle").foregroundStyle(Color.primary)
                        .frame(width: 44, height: 44).background(Color.primary.opacity(0.15), in: Circle())
                    Text(me.name).appFont(18, weight: .bold).foregroundStyle(Color.appForeground)
                }
                Divider()
                profileRow("入社年月日", formatHireDate(me.hireDate) ?? "未登録")
                profileRow("勤続年数", Tenure(hireDate: me.hireDate)?.label ?? "未登録")
            }
            .padding(20)
            .card()
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

/// Email + password login / sign-up. Port of components/auth-form.tsx.
struct AuthForm: View {
    let description: String

    @Environment(AuthStore.self) private var auth
    @State private var mode: AuthMode = .login
    @State private var email = ""
    @State private var password = ""
    @State private var submitting = false
    @State private var error: String?
    @State private var sentTo: String?

    var body: some View {
        if let sentTo {
            VStack(spacing: 12) {
                Image(systemName: "envelope.badge").font(.system(size: 20)).foregroundStyle(Color.primary)
                    .frame(width: 44, height: 44).background(Color.primary.opacity(0.15), in: Circle())
                Text("確認メールを送信しました").appFont(14, weight: .semibold).foregroundStyle(Color.appForeground)
                Text("\(sentTo) 宛のメールに記載のリンクを開くと、登録が完了します。このiPhoneで開くとそのままログインできます。")
                    .appFont(12).foregroundStyle(Color.mutedForeground).multilineTextAlignment(.center)
                Button("ログイン画面に戻る") {
                    self.sentTo = nil
                    mode = .login
                }
                .appFont(12, weight: .semibold)
            }
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 24).padding(.vertical, 40)
            .card()
        } else {
            form
        }
    }

    private var form: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 12) {
                Image(systemName: "envelope").foregroundStyle(Color.primary)
                    .frame(width: 44, height: 44).background(Color.primary.opacity(0.15), in: Circle())
                VStack(alignment: .leading, spacing: 2) {
                    Text(mode == .login ? "ログイン" : "新規登録").appFont(16, weight: .bold).foregroundStyle(Color.appForeground)
                    Text(description).appFont(12).foregroundStyle(Color.mutedForeground)
                }
            }
            FormField(label: "メールアドレス") {
                TextField("", text: $email)
                    .textContentType(.emailAddress)
                    .emailKeyboard()
                    .autocorrectionDisabled()
                    .appFont(14)
                    .padding(.horizontal, 14).padding(.vertical, 10).card(radius: 14, fill: .appBackground)
            }
            FormField(label: "パスワード") {
                SecureField("6文字以上", text: $password)
                    .textContentType(mode == .login ? .password : .newPassword)
                    .appFont(14)
                    .padding(.horizontal, 14).padding(.vertical, 10).card(radius: 14, fill: .appBackground)
            }
            if let error {
                Text(error).appFont(12, weight: .semibold).foregroundStyle(Color.destructive)
            }
            Button(mode == .login ? "ログイン" : "登録する", action: submit)
                .buttonStyle(PillButtonStyle())
                .disabled(submitting || !AuthErrorMessage.canSubmit(email: email, password: password))
                .opacity(submitting || !AuthErrorMessage.canSubmit(email: email, password: password) ? 0.4 : 1)
            Button(mode == .login ? "アカウントをお持ちでない方はこちら" : "すでにアカウントをお持ちの方はこちら") {
                mode = mode == .login ? .signUp : .login
                error = nil
            }
            .appFont(12, weight: .semibold)
            .frame(maxWidth: .infinity)
        }
        .padding(20)
        .card()
    }

    private func submit() {
        submitting = true
        error = nil
        Task {
            defer { submitting = false }
            switch mode {
            case .login:
                error = await auth.signIn(email: email, password: password)
            case .signUp:
                if let failure = await auth.signUp(email: email, password: password) {
                    error = failure
                } else {
                    sentTo = email
                }
            }
        }
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
