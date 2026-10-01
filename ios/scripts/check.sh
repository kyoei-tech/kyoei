#!/bin/sh
# Runs KyoeiCore's tests and typechecks the app sources on macOS using only
# the Command Line Tools (no Xcode). Works around two CLT gaps:
#  - swift-testing's macro plugin lives in a subdirectory not on the default
#    plugin search path;
#  - the macOS 27 SDK declares @State as a macro whose plugin only ships with
#    Xcode, so the app check builds against the 26.x SDK.
set -eu
cd "$(dirname "$0")/.."

CLT=/Library/Developer/CommandLineTools
TESTING_PLUGINS="$CLT/usr/lib/swift/host/plugins/testing"
SDK26="$CLT/SDKs/MacOSX26.sdk"

echo "== KyoeiCore tests"
(cd KyoeiCore && swift test -Xswiftc -plugin-path -Xswiftc "$TESTING_PLUGINS")

echo "== App sources typecheck (macOS)"
if [ -d "$SDK26" ]; then
    (cd AppCheck && SDKROOT="$SDK26" swift build)
else
    (cd AppCheck && swift build)
fi

echo "== Edge Function tests (push-dispatch, parse-dispatch-sheet, account-setup)"
if command -v node >/dev/null 2>&1; then
    node --test ../supabase/functions/push-dispatch/push-dispatch.test.ts \
        ../supabase/functions/parse-dispatch-sheet/parse-dispatch-sheet.test.ts \
        ../supabase/functions/account-setup/account-setup.test.ts
else
    echo "(node not found; skipped)"
fi

# iOS-only code (#if os(iOS): camera, VisionKit, UIKit wrappers) is skipped
# by the macOS check above, so also build for the iOS Simulator when Xcode
# is installed. Uses a throwaway copy of the AppCheck manifest with iOS 17
# added; nothing in the repo changes.
XCODE=/Applications/Xcode.app/Contents/Developer
if [ -d "$XCODE/Platforms/iPhoneSimulator.platform" ]; then
    echo "== App sources build (iOS Simulator)"
    WORK="${TMPDIR:-/tmp}/kyoei-ioscheck"
    mkdir -p "$WORK/Sources"
    ln -sfn "$PWD/Kyoei" "$WORK/Sources/KyoeiAppCheck"
    sed -e 's#platforms: \[.macOS(.v14)\]#platforms: [.macOS(.v14), .iOS(.v17)]#' \
        -e "s#\"../KyoeiCore\"#\"$PWD/KyoeiCore\"#" AppCheck/Package.swift > "$WORK/Package.swift"
    (cd "$WORK" && DEVELOPER_DIR="$XCODE" xcodebuild -quiet -scheme KyoeiAppCheck \
        -destination 'generic/platform=iOS Simulator' -derivedDataPath "$WORK/dd" build)
else
    echo "(Xcode not found; iOS build skipped)"
fi
