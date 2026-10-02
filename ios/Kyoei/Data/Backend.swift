import Foundation
import Supabase

/// Shared Supabase client. Like the web app, most tables are readable and
/// writable with the anon key (open RLS, "共有端末" convention); only
/// マイページ / 配車表 layer Supabase Auth on top.
enum Backend {
    static let client = SupabaseClient(
        supabaseURL: AppConfig.supabaseURL,
        supabaseKey: AppConfig.supabaseAnonKey
    )
}
