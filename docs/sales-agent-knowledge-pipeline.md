# Sales Agent knowledge preparation pipeline

Pipeline chuẩn bị corpus VinFast gồm đúng 31 phiên bản từ `.local/vinfast_manuals_copy`, sinh hierarchical chunks và dùng `text-embedding-3-small` với 512 chiều (`openai-text-embedding-3-small-512-v1`). Nguồn text là section Markdown; `rag_chunks`, `vinfast_chunks_all.jsonl` và `full_manual.md` không phải retrieval authority.

## 1. Chuẩn bị local — không DB, không API

```powershell
npm run knowledge:prepare
npm run knowledge:embed:plan
```

Output mặc định nằm tại `.local/knowledge-build/v2/`: catalog v2, documents/chunks JSONL, report và build hash. Script dừng ngay nếu manifest 31 edition hoặc các tổng kiểm kê bị drift.

## 2. Gọi embedding — cần phê duyệt riêng

```powershell
$env:OPENAI_API_KEY = '<secret>'
$env:KNOWLEDGE_EMBED_APPROVED = 'YES'
npm run knowledge:embed
```

Chỉ `--execute` (được package script truyền vào) **và** biến approval mới cho phép gọi API. Kết quả có checkpoint `.partial`, cache key gắn model/generation/input và kiểm tra đủ 512 chiều, finite, non-zero.

## 3. Supabase — mặc định chỉ validate

```powershell
npm run knowledge:push:plan
```

Ghi DB yêu cầu đồng thời `--apply`, `KNOWLEDGE_SUPABASE_APPLY_APPROVED=YES`, service-role key, author/reviewer UUID khác nhau và artifacts embedding khớp build hash. Activate còn có gate riêng `KNOWLEDGE_SUPABASE_ACTIVATE_APPROVED=YES`.

Không chạy migration, import, embed hoặc activate chỉ vì file/script đã tồn tại. Migration 060 vẫn phải qua disposable apply/rollback/reapply trước live rollout.
