# Supabase（本仓库）

本应用通过 **Vite 环境变量** 连接 Supabase，浏览器端仅使用 **`anon` 公钥** 与用户 JWT；**切勿**把 `service_role` 写入仓库、`.env` 或任何在浏览器中打包的变量。

## 环境变量

复制仓库根目录的 `.env.example` 为 `.env`，填写：

- `VITE_SUPABASE_URL` — 项目 Settings → API → Project URL  
- `VITE_SUPABASE_ANON_KEY` — **anon public** key  

本地开发：`npm run dev`。

## 数据库迁移（RLS + 表结构）

SQL 位于 `supabase/migrations/`。推荐用 **Supabase CLI** 在你本机对「已关联的项目」执行（由你控制生产环境，Cursor/MCP 只改文件）：

```bash
# 安装 CLI 后，在项目根目录
supabase link --project-ref <your-project-ref>
supabase db push
```

或在 Dashboard → **SQL Editor** 中粘贴迁移文件内容执行（注意顺序、仅执行一次）。

迁移会创建：`profiles`、`menu_items`、`reviews`、`orders`、Storage 桶 **`menu-images`**（公开读、仅 `owner` 角色可写）。

## 种子用户（员工 / 老板）

Supabase Auth 使用 **邮箱 + 密码**。建议在 Dashboard → Authentication → Users **手动创建**（或使用你本机一次性 Admin 脚本，**不要**把 `service_role` 放进前端）：

| 用途 | 建议邮箱 | 建议密码 | 创建后执行 |
|------|-----------|-----------|------------|
| 员工 | `worker@diner-desk.local` | `imworker` | 将 `public.profiles` 中该用户 `role` 更新为 `staff` |
| 老板 | `boss@diner-desk.local` | `imboss` | 将 `role` 更新为 `owner` |

在 SQL Editor 中（将 `:user_id` 换成 Dashboard 里该用户的 UUID）：

```sql
update public.profiles set role = 'staff' where id = '<uuid>';
-- 或
update public.profiles set role = 'owner' where id = '<uuid>';
```

登录页用户名可填 **`worker` / `boss`**（会自动补全为 `@diner-desk.local` 域名）或完整邮箱。

## RLS 行为摘要（便于自测）

| 角色 | `menu_items` | `reviews` | `orders` |
|------|----------------|------------|----------|
| 匿名 | 读 `available = true` | 读全部 | 仅插入 `placed_by_id = 'guest'`；**不可**读订单 |
| 顾客（已登录） | 同上 | 读全部；插入本人评价 | 插入/读取本人 `placed_by_id = auth.uid()` |
| 员工 / 老板 | 读全部 | 读全部；老板可删改他人评价 | 读全部；更新状态/就绪 |

## MCP / Cursor

适合让助手**编辑迁移 SQL 与前端代码**；**应用迁移**、**创建 Auth 用户**、**改 role** 仍应由你在 Dashboard 或本机 CLI 完成，避免把高权限密钥交给工具链。

## 顾客注册与邮箱

未带 `@` 的注册名将映射为 `用户名@diner-desk.local`（与登录一致）。若项目在 Auth 中开启了「邮箱确认」，注册后可能需先确认邮件再拿到会话；界面会提示 `REG_CONFIRM_EMAIL`。
