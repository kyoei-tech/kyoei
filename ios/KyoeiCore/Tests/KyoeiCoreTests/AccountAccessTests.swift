import Foundation
import Testing
@testable import KyoeiCore

@Suite struct AccountAccessTests {
    @Test func loginIDs() {
        #expect(LoginID.normalize(" １００１ ") == "1001")
        #expect(LoginID.normalize("Kyoei.Taro") == "kyoei.taro")
        #expect(LoginID.normalize("ab") == nil)
        #expect(LoginID.normalize("名前") == nil)
        #expect(LoginID.email(forInput: "1001") == "1001@id.kyoei.invalid")
        #expect(LoginID.email(forInput: " Old@Example.com ") == "old@example.com")
        #expect(LoginID.email(forInput: "x") == nil)
        #expect(LoginID.display(email: "1001@id.kyoei.invalid") == "1001")
        #expect(LoginID.display(email: "old@example.com") == "old@example.com")
    }

    @Test func setupCodes() throws {
        #expect(SetupCode.normalize("abcd-efgh-jkmn-pqrs") == "ABCDEFGHJKMNPQRS")
        #expect(SetupCode.normalize("ＡＢＣＤ ＥＦＧＨ ＪＫＭＮ ＰＱＲＳ") == "ABCDEFGHJKMNPQRS")
        #expect(SetupCode.normalize("ABCD-EFGH-JKMN-PQR0") == nil)
        #expect(SetupCode.normalize("ABCD") == nil)
        #expect(SetupCode.format("ABCDEFGHJKMNPQRS") == "ABCD-EFGH-JKMN-PQRS")
        #expect(SetupCode.from(url: try #require(URL(string: "kyoei://setup?t=ABCDEFGHJKMNPQRS"))) == "ABCDEFGHJKMNPQRS")
        #expect(SetupCode.from(url: try #require(URL(string: "kyoei://auth/callback?code=x"))) == nil)
    }

    @Test func passwords() {
        #expect(PasswordRule.problem("1234567", confirmation: "1234567") == "パスワードは8文字以上にしてください。")
        #expect(PasswordRule.problem("12345678", confirmation: "12345679") == "確認用のパスワードが一致しません。")
        #expect(PasswordRule.problem("12345678", confirmation: "12345678") == nil)
    }

    @Test func lockOnlyAfterAMinuteAway() {
        let now = Date(timeIntervalSince1970: 1_000_000)
        #expect(!AppLockPolicy.needsUnlock(lastInactive: nil, now: now))
        #expect(!AppLockPolicy.needsUnlock(lastInactive: now.addingTimeInterval(-59), now: now))
        #expect(AppLockPolicy.needsUnlock(lastInactive: now.addingTimeInterval(-60), now: now))
        #expect(AppLockPolicy.needsUnlock(lastInactive: now.addingTimeInterval(-3600 * 24), now: now))
    }

    @Test func accountRowsAndRequests() throws {
        let row = try JSONDecoder().decode(AccountRow.self, from: Data(#"{"user_id":"u","login_id":"1001","is_driver":true,"can_search_customers":true,"is_admin":false,"disabled_at":null}"#.utf8))
        #expect(row.roleLabel == "ドライバー・顧客検索" && !row.isDisabled)
        let body = String(decoding: try JSONEncoder().encode(AccountSetupRequest(token: "ABCD", password: "p")), as: UTF8.self)
        #expect(body.contains(#""token":"ABCD""#))
        let result = try JSONDecoder().decode(AccountSetupResult.self, from: Data(#"{"loginId":"1001","purpose":"setup"}"#.utf8))
        #expect(result.loginId == "1001")
    }

    @Test func adminLoginApproval() throws {
        #expect(AdminLoginApproval.message(requestID: "r1", choice: 42, approve: true) == "kyoei-admin-login|r1|42|approve")
        #expect(AdminLoginApproval.message(requestID: "r1", choice: 0, approve: false) == "kyoei-admin-login|r1|0|deny")
        let mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36"
        #expect(AdminLoginApproval.describe(userAgent: mac) == "Mac の Chrome")
        #expect(AdminLoginApproval.describe(userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36 Edg/141.0") == "Windows の Edge")
        #expect(AdminLoginApproval.describe(userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/26.0 Safari/605.1.15") == "Mac の Safari")
        #expect(AdminLoginApproval.describe(userAgent: "") == "パソコン")
        let row = try JSONDecoder().decode(AdminLoginRequestRow.self, from: Data(#"{"id":"r1","choices":[80,25,51],"user_agent":"x","created_at":"2026-10-02T03:00:00+00:00","expires_at":"2026-10-02T03:03:00+00:00"}"#.utf8))
        #expect(row.choices == [80, 25, 51])
        let body = String(decoding: try JSONEncoder().encode(AccountSetupRequest(token: "T", password: "p", devicePublicKey: "K")), as: UTF8.self)
        #expect(body.contains(#""devicePublicKey":"K""#))
    }
}
