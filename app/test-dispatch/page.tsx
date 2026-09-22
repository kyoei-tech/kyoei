import { DispatchSheetView } from '@/components/dispatch-sheet-view'

export default function TestDispatchPage() {
  return (
    <main className="mx-auto max-w-md p-4">
      <DispatchSheetView staffId="test-staff-id" staffName="テスト" />
    </main>
  )
}
