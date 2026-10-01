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

echo "== push-dispatch Edge Function tests"
if command -v node >/dev/null 2>&1; then
    node --test ../supabase/functions/push-dispatch/push-dispatch.test.ts
else
    echo "(node not found; skipped)"
fi
