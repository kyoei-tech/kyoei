import { DispatchSheetView } from '@/components/dispatch-sheet-view'

export default function TestDispatchPage() {
  return (
    <div className="min-h-screen bg-background p-4">
      <DispatchSheetView staffId="00000000-0000-0000-0000-000000000001" staffName="テスト" />
    </div>
  )
}
