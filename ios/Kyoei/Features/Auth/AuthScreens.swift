import KyoeiCore
import SwiftUI

// Sign-in gate shown before the app: login (login ID + password), first-time
// setup / password reset with an admin's one-time code, the Face ID lock,
// and the "account not usable" screen. All on the brand charcoal with the
// lime logo, in both appearances.

/// Picks what to show for the current session.
struct RootView: View {
    @Environment(AuthStore.self) private var auth
    @Environment(AppLockStore.self) private var lock
    @Environment(AdminApprovalStore.self) private var approvals
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        ZStack {
            switch auth.state {
            case .loading:
                SplashView()
            case .signedOut:
                SignInFlow()
            case .signedIn where isDebugSignInShot:
                SignInFlow()
            case .signedIn:
                switch auth.accountStatus {
                case .checking:
                    SplashView()
                case .active(let account):
                    AppShell()
                        // Admins: console sign-ins wait here for approval.
                        .task(id: account.is_admin && scenePhase == .active) {
                            guard account.is_admin, scenePhase == .active else { return }
                            await approvals.poll()
                        }
                    if !lock.isLocked { AdminApprovalView() }
                case .missing:
                    AccountBlockedView(message: "このアカウントはまだ使えません。管理者に、アカウントの登録（ログインIDの発行）を依頼してください。")
                case .disabled:
                    AccountBlockedView(message: "このアカウントは停止されています。管理者に確認してください。")
                }
                if lock.isLocked { LockView().transition(.opacity) }
            }
        }
        .task {
            // Typing the password just now is proof enough; restoring the
            // saved session at launch (a cold start) keeps the lock.
            auth.onSignIn = { [lock] in lock.unlock() }
            await auth.observe()
        }
        .onOpenURL { url in Task { await auth.handle(url: url) } }
        #if DEBUG
        .task(id: auth.state) {
            switch auth.state {
            case .signedOut:
                if let id = DebugShot.loginID, let pw = DebugShot.password { _ = await auth.signIn(loginID: id, password: pw) }
            case .signedIn:
                if !DebugShot.name.isEmpty && DebugShot.name != "lock" { lock.unlock() }
            default:
                break
            }
        }
        #endif
        .onChange(of: scenePhase) { _, phase in
            switch phase {
            case .background:
                lock.didLeave()
            case .active:
                lock.didReturn()
                Task { await auth.refreshAccount() }
            default:
                break
            }
        }
    }
}

extension RootView {
    /// Screenshots of the sign-in screens while a demo session exists.
    var isDebugSignInShot: Bool {
        #if DEBUG
        DebugShot.name == "login" || DebugShot.name == "setup"
        #else
        false
        #endif
    }
}

/// Charcoal page with the logo, used by every screen here.
private struct BrandPage<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                Image("KyoeiLogo")
                    .resizable()
                    .scaledToFit()
                    .frame(height: 36)
                    .padding(.top, 48)
                    .accessibilityLabel("KYOEI")
                content
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 32)
            .frame(maxWidth: 448)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Color.chrome.ignoresSafeArea())
        .environment(\.colorScheme, .dark)
    }
}

struct SplashView: View {
    var body: some View {
        ZStack {
            Color.chrome.ignoresSafeArea()
            Image("KyoeiLogo").resizable().scaledToFit().frame(height: 40).accessibilityLabel("KYOEI")
        }
    }
}

/// Login, or the setup screen when a code is pending / requested.
private struct SignInFlow: View {
    @Environment(AuthStore.self) private var auth
    @State private var showingSetup = false

    var body: some View {
        if showingSetup || auth.pendingSetupCode != nil {
            SetupPasswordView(initialCode: auth.pendingSetupCode ?? "", onCancel: {
                showingSetup = false
                auth.pendingSetupCode = nil
            })
        } else {
            LoginView(onSetup: { showingSetup = true })
                #if DEBUG
                .onAppear { if DebugShot.name == "setup" { showingSetup = true } }
                #endif
        }
    }
}

private struct LoginView: View {
    let onSetup: () -> Void

    @Environment(AuthStore.self) private var auth
    @State private var loginID = ""
    @State private var password = ""
    @State private var submitting = false
    @State private var error: String?

    var body: some View {
        BrandPage {
            VStack(alignment: .leading, spacing: 16) {
                Text("ログイン").appFont(20, weight: .black).foregroundStyle(Color.chromeForeground)
                DarkField(label: "ログインID", placeholder: "例：1001") {
                    TextField("", text: $loginID, prompt: Text("例：1001").foregroundStyle(Color.chromeMuted))
                        .textContentType(.username)
                        .asciiKeyboard()
                        .autocorrectionDisabled()
                }
                DarkField(label: "パスワード", placeholder: "") {
                    SecureField("", text: $password)
                        .textContentType(.password)
                }
                if let error {
                    Text(error).appFont(13, weight: .bold).foregroundStyle(Color.destructive)
                }
                Button(action: submit) {
                    Text(submitting ? "ログイン中…" : "ログイン")
                        .appFont(17, weight: .black)
                        .italic()
                        .frame(maxWidth: .infinity, minHeight: 52)
                        .foregroundStyle(Color.brandForeground)
                        .background(Color.brand, in: SlantedRectangle(slant: 10))
                }
                .buttonStyle(PressScaleStyle())
                .disabled(submitting || loginID.isEmpty || password.isEmpty)
                .opacity(loginID.isEmpty || password.isEmpty ? 0.5 : 1)
            }
            .padding(20)
            .background(Color(white: 0.16), in: RoundedRectangle(cornerRadius: 20))
            .overlay(RoundedRectangle(cornerRadius: 20).stroke(Color.cardEdge))

            VStack(spacing: 8) {
                Text("初めての方・パスワードを忘れた方").appFont(13).foregroundStyle(Color.chromeMuted)
                Button(action: onSetup) {
                    Label("管理者から受け取ったコードで設定する", systemImage: "key.fill")
                        .appFont(15, weight: .bold)
                        .foregroundStyle(Color.brand)
                        .padding(.horizontal, 18)
                        .padding(.vertical, 12)
                        .overlay(Capsule().stroke(Color.brand, lineWidth: 1.5))
                }
                .buttonStyle(PressScaleStyle())
            }
        }
    }

    private func submit() {
        submitting = true
        error = nil
        Task {
            defer { submitting = false }
            error = await auth.signIn(loginID: loginID, password: password)
        }
    }
}

/// First-time setup or password reset with a one-time code from an admin.
private struct SetupPasswordView: View {
    let initialCode: String
    let onCancel: () -> Void

    @Environment(AuthStore.self) private var auth
    @State private var code = ""
    @State private var password = ""
    @State private var confirmation = ""
    @State private var submitting = false
    @State private var error: String?

    var body: some View {
        BrandPage {
            VStack(alignment: .leading, spacing: 16) {
                Text("パスワードの設定").appFont(20, weight: .black).foregroundStyle(Color.chromeForeground)
                Text("管理者から受け取ったコードと、これから使うパスワードを入力してください。QRコードから開いた場合、コードは入力済みです。")
                    .appFont(13).foregroundStyle(Color.chromeMuted)
                DarkField(label: "コード（16文字）", placeholder: "") {
                    TextField("", text: $code, prompt: Text("XXXX-XXXX-XXXX-XXXX").foregroundStyle(Color.chromeMuted))
                        .asciiKeyboard()
                        .autocorrectionDisabled()
                        .font(.system(size: 17, weight: .bold, design: .monospaced))
                }
                DarkField(label: "新しいパスワード（\(PasswordRule.minLength)文字以上）", placeholder: "") {
                    SecureField("", text: $password).textContentType(.newPassword)
                }
                DarkField(label: "新しいパスワード（確認）", placeholder: "") {
                    SecureField("", text: $confirmation).textContentType(.newPassword)
                }
                if let error {
                    Text(error).appFont(13, weight: .bold).foregroundStyle(Color.destructive)
                }
                Button(action: submit) {
                    Text(submitting ? "設定中…" : "パスワードを設定してログイン")
                        .appFont(17, weight: .black)
                        .italic()
                        .frame(maxWidth: .infinity, minHeight: 52)
                        .foregroundStyle(Color.brandForeground)
                        .background(Color.brand, in: SlantedRectangle(slant: 10))
                }
                .buttonStyle(PressScaleStyle())
                .disabled(submitting)
            }
            .padding(20)
            .background(Color(white: 0.16), in: RoundedRectangle(cornerRadius: 20))
            .overlay(RoundedRectangle(cornerRadius: 20).stroke(Color.cardEdge))

            Button("ログイン画面に戻る", action: onCancel)
                .appFont(14, weight: .bold)
                .foregroundStyle(Color.chromeMuted)
        }
        .onAppear { if code.isEmpty { code = initialCode.isEmpty ? "" : SetupCode.format(initialCode) } }
    }

    private func submit() {
        if let problem = PasswordRule.problem(password, confirmation: confirmation) {
            error = problem
            return
        }
        submitting = true
        error = nil
        Task {
            defer { submitting = false }
            error = await auth.completeSetup(code: code, password: password)
        }
    }
}

/// Shown over the app after it has been away for a minute or more.
struct LockView: View {
    @Environment(AuthStore.self) private var auth
    @Environment(AppLockStore.self) private var lock
    @State private var password = ""
    @State private var usePassword = false
    @State private var error: String?
    @State private var checking = false

    var body: some View {
        BrandPage {
            VStack(spacing: 16) {
                Image(systemName: "lock.fill").font(.system(size: 34, weight: .bold)).foregroundStyle(Color.brand)
                Text("ロック中").appFont(20, weight: .black).foregroundStyle(Color.chromeForeground)
                if let label = auth.loginLabel {
                    Text("ログインID：\(label)").appFont(14).foregroundStyle(Color.chromeMuted)
                }
                if usePassword || !lock.canUseDeviceAuthentication {
                    DarkField(label: "パスワード", placeholder: "") {
                        SecureField("", text: $password).textContentType(.password)
                    }
                    if let error {
                        Text(error).appFont(13, weight: .bold).foregroundStyle(Color.destructive)
                    }
                    Button(action: unlockWithPassword) {
                        Text(checking ? "確認中…" : "解除する")
                            .appFont(17, weight: .black)
                            .frame(maxWidth: .infinity, minHeight: 52)
                            .foregroundStyle(Color.brandForeground)
                            .background(Color.brand, in: SlantedRectangle(slant: 10))
                    }
                    .buttonStyle(PressScaleStyle())
                    .disabled(checking || password.isEmpty)
                } else {
                    Button { Task { _ = await lock.authenticate() } } label: {
                        Label("Face IDで解除", systemImage: "faceid")
                            .appFont(17, weight: .black)
                            .frame(maxWidth: .infinity, minHeight: 52)
                            .foregroundStyle(Color.brandForeground)
                            .background(Color.brand, in: SlantedRectangle(slant: 10))
                    }
                    .buttonStyle(PressScaleStyle())
                    Button("パスワードで解除する") { usePassword = true }
                        .appFont(14, weight: .bold)
                        .foregroundStyle(Color.chromeMuted)
                }
                Button("ログアウト") { Task { await auth.signOut() } }
                    .appFont(14, weight: .bold)
                    .foregroundStyle(Color.chromeMuted)
                    .padding(.top, 12)
            }
            .padding(20)
        }
        .task {
            #if DEBUG
            if DebugShot.name == "lock" { return }
            #endif
            if lock.canUseDeviceAuthentication { _ = await lock.authenticate() }
        }
    }

    private func unlockWithPassword() {
        checking = true
        error = nil
        Task {
            defer { checking = false }
            if await auth.verifyPassword(password) {
                lock.unlock()
            } else {
                error = "パスワードが正しくありません。"
            }
        }
    }
}

/// Signed in, but the account can't use the app (not registered / stopped).
private struct AccountBlockedView: View {
    let message: String
    @Environment(AuthStore.self) private var auth

    var body: some View {
        BrandPage {
            VStack(spacing: 16) {
                Image(systemName: "person.crop.circle.badge.exclamationmark").font(.system(size: 40)).foregroundStyle(Color.brand)
                Text(message).appFont(15, weight: .bold).foregroundStyle(Color.chromeForeground).multilineTextAlignment(.center)
                Button("もう一度確認する") { Task { await auth.refreshAccount() } }
                    .appFont(15, weight: .bold).foregroundStyle(Color.brand)
                Button("ログアウト") { Task { await auth.signOut() } }
                    .appFont(14, weight: .bold).foregroundStyle(Color.chromeMuted)
            }
            .padding(20)
        }
    }
}

/// Labeled input on the dark sign-in pages.
private struct DarkField<Field: View>: View {
    let label: String
    let placeholder: String
    @ViewBuilder var field: Field

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).appFont(13, weight: .bold).foregroundStyle(Color.chromeMuted)
            field
                .appFont(17)
                .foregroundStyle(Color.chromeForeground)
                .padding(.horizontal, 14)
                .frame(minHeight: 50)
                .background(Color(white: 0.10), in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.chromeMuted.opacity(0.5)))
        }
    }
}
