import Foundation
import Testing
@testable import KyoeiCore

@Suite struct TripLogTests {
    let t0 = date(2026, 9, 1, 8)

    @Test func startRunsDrivingAndContinuous() {
        let trip = TripState.start(at: t0, splitRestRemaining: nil)
        let now = t0 + 90 * minute
        #expect(trip.liveDuration(of: .driving, at: now) == 90 * minute)
        #expect(trip.liveContinuousDriving(at: now) == 90 * minute)
        #expect(trip.liveBreakTimer(at: now) == 0)
    }

    @Test func breakTapStopsContinuousAndStartsBreakTimer() {
        let trip = TripState.start(at: t0, splitRestRemaining: nil)
            .tappingBreak(.loading, at: t0 + 2 * hour)
        let now = t0 + 2 * hour + 15 * minute
        #expect(trip.activeCategory == .loading)
        #expect(trip.totals.driving == 2 * hour)
        #expect(trip.liveContinuousDriving(at: now) == 2 * hour)
        #expect(trip.liveBreakTimer(at: now) == 15 * minute)
        #expect(trip.liveDuration(of: .loading, at: now) == 15 * minute)
    }

    @Test func shortBreakUnderTenMinutesDoesNotCount() {
        let trip = TripState.start(at: t0, splitRestRemaining: nil)
            .tappingBreak(.waiting, at: t0 + hour)
            .tappingResumeDriving(at: t0 + hour + 9 * minute)
        #expect(trip.breakTimer == 0)
        #expect(trip.continuousDriving == hour)
        #expect(trip.totals.waiting == 9 * minute)
    }

    @Test func tenMinuteBreaksAccumulateWithoutResettingContinuous() {
        let trip = TripState.start(at: t0, splitRestRemaining: nil)
            .tappingBreak(.resting, at: t0 + hour)
            .tappingResumeDriving(at: t0 + hour + 10 * minute)
            .tappingBreak(.resting, at: t0 + 2 * hour)
            .tappingResumeDriving(at: t0 + 2 * hour + 15 * minute)
        #expect(trip.breakTimer == 25 * minute)
        #expect(trip.continuousDriving == 2 * hour - 10 * minute)
    }

    @Test func thirtyMinuteBreakAutoResetsThenResumeClearsContinuous() {
        var trip = TripState.start(at: t0, splitRestRemaining: nil)
            .tappingBreak(.resting, at: t0 + 3 * hour)
        #expect(trip.breakSatisfiesAt == t0 + 3 * hour + 30 * minute)

        let unchanged = trip.ticked(at: t0 + 3 * hour + 29 * minute)
        #expect(unchanged == trip)

        let satisfiedAt = t0 + 3 * hour + 30 * minute
        trip = trip.ticked(at: satisfiedAt)
        #expect(trip.breakSatisfied)
        #expect(trip.breakSatisfiedAt == satisfiedAt)
        #expect(!trip.breakTimerRunning)
        #expect(trip.breakTimer == 0)

        let resumeAt = t0 + 3 * hour + 40 * minute
        trip = trip.tappingResumeDriving(at: resumeAt)
        #expect(trip.continuousDriving == 0)
        #expect(trip.continuousStreakStartedAt == resumeAt)
        #expect(!trip.breakSatisfied)
        #expect(trip.totals.resting == 40 * minute)
    }

    @Test func finalizedTotalsIncludeRunningSegment() {
        let trip = TripState.start(at: t0, splitRestRemaining: 3 * hour)
            .tappingBreak(.unloading, at: t0 + hour)
        let totals = trip.finalizedTotals(at: t0 + hour + 20 * minute)
        #expect(totals.driving == hour)
        #expect(totals.unloading == 20 * minute)
        #expect(trip.splitRestRemaining == 3 * hour)
    }

    @Test func codableRoundTrip() throws {
        let trip = TripState.start(at: t0, splitRestRemaining: nil).tappingBreak(.loading, at: t0 + hour)
        let decoded = try JSONDecoder().decode(TripState.self, from: JSONEncoder().encode(trip))
        #expect(decoded == trip)
    }
}

@Suite struct SplitRestTests {
    @Test func firstValidSplitNeedsRemainderOfTenHours() {
        let result = SplitRestState.initial.registering(rest: 4 * hour)
        #expect(!result.satisfied)
        #expect(result.state == SplitRestState(cumulative: 4 * hour, splitCount: 1))
        #expect(result.remaining == 6 * hour)
        #expect(result.target == 10 * hour)
    }

    @Test func secondSplitReachingTenHoursSatisfies() {
        let first = SplitRestState.initial.registering(rest: 4 * hour).state
        let result = first.registering(rest: 6 * hour)
        #expect(result.satisfied)
        #expect(result.state == .initial)
    }

    @Test func remainingIsFlooredAtThreeHours() {
        let first = SplitRestState.initial.registering(rest: 8 * hour)
        #expect(first.remaining == 3 * hour)
    }

    @Test func tooShortSegmentCannotCompleteAndEscalatesToTwelve() {
        let first = SplitRestState.initial.registering(rest: 8 * hour).state
        // 2h segment pushes the total past 10h, but is itself under 3h.
        #expect(first.wouldEscalate(rest: 2 * hour))
        let second = first.registering(rest: 2 * hour)
        #expect(!second.satisfied)
        #expect(second.target == 12 * hour)
        #expect(second.remaining == 3 * hour)
        // Already on the 12h tier: nothing further to warn about.
        #expect(!second.state.wouldEscalate(rest: hour))
    }

    @Test func firstSplitNeverEscalates() {
        #expect(!SplitRestState.initial.wouldEscalate(rest: hour))
    }
}

@Suite struct TimecardTests {
    let t0 = date(2026, 9, 1, 9)

    @Test func breakTotalsFoldIntoClockOut() {
        var state = TimecardState.clockedIn(at: t0)
        state = state.startingBreak(at: t0 + hour)
        state = state.endingBreak(at: t0 + hour + 45 * minute)
        state = state.startingBreak(at: t0 + 3 * hour)
        #expect(state.liveBreakTotal(at: t0 + 3 * hour + 10 * minute) == 55 * minute)
        #expect(state.liveShiftElapsed(at: t0 + 4 * hour) == 4 * hour)
        state = state.clockingOut(at: t0 + 3 * hour + 15 * minute)
        #expect(!state.clockedIn)
        #expect(state.breakTotal == hour)
        #expect(state.liveShiftElapsed(at: t0 + 5 * hour) == 0)
    }

    @Test func cannotStartBreakWhenClockedOut() {
        #expect(TimecardState.initial.startingBreak(at: t0) == .initial)
    }
}
