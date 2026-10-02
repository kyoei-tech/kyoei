import Foundation
import Testing
@testable import KyoeiCore

@Suite struct MyPageTests {
    let profiles = [
        StaffProfileRow(id: "s1", name: "山田", hire_date: "2020-04-01", auth_user_id: "ABCDEF00-0000-0000-0000-000000000001"),
        StaffProfileRow(id: "s2", name: "佐藤", hire_date: nil, auth_user_id: nil),
    ]

    @Test func linkingLooksUpOwnRowCaseInsensitively() {
        #expect(StaffLink.me(userID: "abcdef00-0000-0000-0000-000000000001", in: profiles)?.id == "s1")
        #expect(StaffLink.me(userID: "other", in: profiles) == nil)
        #expect(StaffLink.me(userID: nil, in: profiles) == nil)
        #expect(StaffLink.unlinked(profiles).map(\.id) == ["s2"])
        #expect(profiles[0].hireDate == LocalDate(year: 2020, month: 4, day: 1))
    }

    @Test func authErrorsAreGenericizedExceptActionableOnes() {
        #expect(AuthErrorMessage.describe("Password should be at least 6 characters", mode: .signUp) == "パスワードは6文字以上で入力してください。")
        #expect(AuthErrorMessage.describe("Email rate limit exceeded", mode: .signUp) == "しばらく時間をおいて再度お試しください。")
        #expect(AuthErrorMessage.describe("User already registered", mode: .signUp) == "登録できませんでした。時間をおいて再度お試しください。")
        #expect(AuthErrorMessage.describe("Email not confirmed", mode: .login).contains("確認リンク"))
        #expect(AuthErrorMessage.describe("Invalid login credentials", mode: .login) == "メールアドレスまたはパスワードが正しくありません。")
        #expect(!AuthErrorMessage.canSubmit(email: "a@b", password: "12345"))
        #expect(AuthErrorMessage.canSubmit(email: "a@b", password: "123456"))
    }

    @Test func myPageItems() {
        #expect(MyPageItem.allCases.first == .redPlates)
        #expect(MyPageItem.allCases[1] == .dispatchSheet)
        #expect(MyPageItem.selfEvaluation.label == "自己評価・目標設定シート")
        #expect(MyPageItem.allCases.filter { !$0.isComingSoon } == [.redPlates, .dispatchSheet, .tripHistory, .inspection, .awardVote, .packagingHistory])
        #expect(MyPageItem(rawValue: "self-eval") == .selfEvaluation)
    }
}
