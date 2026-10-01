import Foundation
import Testing
@testable import KyoeiCore

@Suite struct AdminContentTests {
    @Test func pushRuleValidation() {
        #expect(PushRuleDraft(hours: 4, title: "t", message: "").validated(for: .continuous) == .failure(ValidationError("タイトルと本文を入力してください。")))
        #expect(PushRuleDraft(title: "t", message: "m").validated(for: .driving) == .failure(ValidationError("時間を1分以上に設定してください。")))
        #expect(PushRuleDraft(hours: 3, minutes: 30, title: "t", message: "m").validated(for: .continuous) == .success(3.5 * hour))
        #expect(PushRuleDraft(minutes: 75, title: "t", message: "m").validated(for: .driving) == .success(59 * minute))
        // Break rules ignore the entered time.
        #expect(PushRuleDraft(title: "t", message: "m").validated(for: .break) == .success(30 * minute))
        #expect(PushRuleDraft.new(for: .break).minutes == 30)
    }

    @Test func pushRuleThresholdLabelsAndRoundTrip() {
        #expect(PushRuleDraft.thresholdLabel(4 * hour) == "4時間")
        #expect(PushRuleDraft.thresholdLabel(30 * minute) == "30分")
        #expect(PushRuleDraft.thresholdLabel(3.5 * hour) == "3時間30分")
        let draft = PushRuleDraft(rule: PushNotificationRule(id: "r", timerType: .driving, threshold: 13 * hour + 15 * minute, title: "a", message: "b"))
        #expect(draft == PushRuleDraft(hours: 13, minutes: 15, title: "a", message: "b"))
    }

    @Test func confirmMessageUpdatesRespectButtonVisibility() {
        let normal = ConfirmMessageUpdate(id: "home-departure", message: " 出庫？ ", confirmLabel: " ", cancelLabel: "やめる")
        #expect(normal.message == "出庫？")
        #expect(normal.confirm_label == nil) // empty → original wording
        #expect(normal.cancel_label == "やめる")
        let ackOnly = ConfirmMessageUpdate(id: "home-split-rest-message", message: "m", confirmLabel: "OK", cancelLabel: "x")
        #expect(ackOnly.confirm_label == "OK" && ackOnly.cancel_label == nil)
        let body = ConfirmMessageUpdate(id: "home-split-rest-body", message: "m", confirmLabel: "OK", cancelLabel: "x")
        #expect(body.confirm_label == nil && body.cancel_label == nil)
        #expect(ConfirmMessageUpdate.validationError(id: "home-departure", message: "", confirmLabel: "x") == "本文を入力してください。")
        #expect(ConfirmMessageUpdate.validationError(id: "home-departure", message: "m", confirmLabel: "") == "ボタンの文言を入力してください。")
        #expect(ConfirmMessageUpdate.validationError(id: "home-split-rest-body", message: "m", confirmLabel: "") == nil)
    }

    @Test func storeNameSplitting() {
        #expect(StoreNameInput.split("東京店\n 横浜店 、川崎店、\n\n") == ["東京店", "横浜店", "川崎店"])
        #expect(StoreNameInput.split("  ").isEmpty)
    }

    @Test func changelogGrouping() {
        func row(_ id: String, _ version: String, order: Int, entry: Int, hidden: Bool = false) -> ChangelogRow {
            ChangelogRow(id: id, version: version, version_date: "2026-09-10", page: "p", kind: .added, description: "d", hidden: hidden, version_order: order, entry_order: entry)
        }
        let rows = [row("a", "1.0.0", order: 5, entry: 0), row("c", "1.1.0", order: 2, entry: 1), row("b", "1.1.0", order: 2, entry: 0, hidden: true)]
        let versions = Changelog.grouped(rows)
        #expect(versions.map(\.version) == ["1.1.0", "1.0.0"])
        #expect(versions[0].entries.map(\.id) == ["b", "c"])
        #expect(versions[0].visibleEntries.map(\.id) == ["c"])
        #expect(versions[0].nextEntryOrder == 2)
        #expect(versions[0].dateLabel == "2026年9月10日")
        #expect(Changelog.nextVersionOrder(versions) == -1)
        #expect(Changelog.nextVersionOrder(Changelog.grouped([row("x", "2", order: -3, entry: 0)])) == -4)
        #expect(Changelog.currentVersion(rows) == "1.1.0")
        #expect(Changelog.currentVersion([]) == "1.10.0")
    }
}
