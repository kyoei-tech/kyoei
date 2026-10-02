import KyoeiCore
import SwiftUI

/// "管理画面へのログイン" — pick the number shown on the PC, then Face ID.
struct AdminApprovalView: View {
    @Environment(AdminApprovalStore.self) private var approvals

    var body: some View {
        if let request = approvals.pending {
            ZStack {
                Color.black.opacity(0.6).ignoresSafeArea()
                VStack(spacing: 18) {
                    Image(systemName: "desktopcomputer").font(.system(size: 36, weight: .bold)).foregroundStyle(Color.brand)
                    Text("管理画面へのログイン").appFont(20, weight: .black).foregroundStyle(Color.chromeForeground)
                    Text("\(request.deviceLabel) から、管理画面にログインしようとしています。")
                        .appFont(14).foregroundStyle(Color.chromeMuted).multilineTextAlignment(.center)
                    Text("パソコンの画面に表示されている数字を選んでください")
                        .appFont(15, weight: .bold).foregroundStyle(Color.chromeForeground).multilineTextAlignment(.center)
                    HStack(spacing: 12) {
                        ForEach(request.choices, id: \.self) { number in
                            Button { Task { await approvals.answer(choice: number, approve: true) } } label: {
                                Text("\(number)")
                                    .font(.system(size: 34, weight: .heavy).width(.condensed).italic())
                                    .frame(maxWidth: .infinity, minHeight: 72)
                                    .foregroundStyle(Color.brandForeground)
                                    .background(Color.brand, in: RoundedRectangle(cornerRadius: 16))
                            }
                            .buttonStyle(PressScaleStyle())
                            .accessibilityLabel("\(number)を選んで承認")
                        }
                    }
                    .disabled(approvals.answering)
                    Text("選ぶと Face ID で確認します。").appFont(12).foregroundStyle(Color.chromeMuted)
                    Button { Task { await approvals.answer(choice: nil, approve: false) } } label: {
                        Text("心当たりがない（拒否する）")
                            .appFont(15, weight: .bold)
                            .foregroundStyle(Color.destructive)
                            .frame(maxWidth: .infinity, minHeight: 48)
                            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.destructive, lineWidth: 1.5))
                    }
                    .disabled(approvals.answering)
                }
                .padding(24)
                .frame(maxWidth: 420)
                .background(Color.chrome, in: RoundedRectangle(cornerRadius: 24))
                .overlay(RoundedRectangle(cornerRadius: 24).stroke(Color.cardEdge))
                .padding(20)
            }
            .transition(.opacity)
        } else if let message = approvals.lastResult {
            VStack {
                Spacer()
                Text(message)
                    .appFont(14, weight: .bold)
                    .foregroundStyle(Color.chromeForeground)
                    .padding(14)
                    .frame(maxWidth: .infinity)
                    .background(Color.chrome, in: RoundedRectangle(cornerRadius: 14))
                    .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.cardEdge))
                    .padding(.horizontal, 20)
                    .padding(.bottom, 100)
                    .onTapGesture { approvals.dismissResult() }
            }
            .task {
                try? await Task.sleep(for: .seconds(5))
                approvals.dismissResult()
            }
        }
    }
}
