import Foundation
import Testing
@testable import KyoeiCore

@Suite struct RemotePushTests {
    @Test func registrationEncodesHexTokenAndSortedTopics() throws {
        let token = Data([0x00, 0xab, 0x10, 0xff])
        let registration = PushRegistration(deviceID: "dev", token: token, environment: .sandbox, staffMemberID: "s1", topics: [.staffStatus, .news])
        #expect(registration.p_apns_token == "00ab10ff")
        #expect(registration.p_topics == ["news", "staff_status"])
        let json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(registration)) as? [String: Any]
        #expect(json?["p_apns_environment"] as? String == "sandbox")
        #expect(json?["p_device_id"] as? String == "dev")
    }

    @Test func pushKindRouting() {
        let news = PushKind(userInfo: ["kind": "news", "id": "n1", "aps": [:]])
        #expect(news == .news(id: "n1"))
        #expect(news?.foregroundPresentation == .suppressed)
        #expect(news?.destinationTab == .news)
        let staff = PushKind(userInfo: ["kind": "staff_status", "id": "s1"])
        #expect(staff?.foregroundPresentation == .banner)
        #expect(staff?.destinationTab == .staff)
        // Local driving-timer notifications carry no kind.
        #expect(PushKind(userInfo: [:]) == nil)
        #expect(PushKind(userInfo: ["kind": "other"]) == nil)
    }

    @Test func settingsPushTopicsDefaultAndTolerantDecoding() throws {
        #expect(AppSettings().pushTopics == Set(PushTopic.allCases))
        let legacy = try JSONDecoder().decode(AppSettings.self, from: Data(#"{"theme":"dark"}"#.utf8))
        #expect(legacy.pushTopics == Set(PushTopic.allCases))
        let stored = try JSONDecoder().decode(AppSettings.self, from: Data(#"{"pushTopics":["news","future_topic"]}"#.utf8))
        #expect(stored.pushTopics == [.news])
        var settings = AppSettings()
        settings.pushTopics = []
        let roundTrip = try JSONDecoder().decode(AppSettings.self, from: JSONEncoder().encode(settings))
        #expect(roundTrip.pushTopics.isEmpty)
    }
}
