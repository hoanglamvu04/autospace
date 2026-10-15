# AutoSpace

AutoSpace là trung tâm quản lý chiến dịch phân phối nội dung: tạo campaign, quản lý content variant, target, provider connection, xếp hàng BullMQ và theo dõi trạng thái từng job trong PostgreSQL.

Hệ thống chỉ tự động xuất bản khi một provider có API/quyền hợp lệ. Dry Run không gọi API đăng bài ra bên ngoài. Target API chưa gắn connection hợp lệ dừng ở `WAITING_CONNECTION`; target cần thao tác người dùng dừng ở `AWAITING_CONFIRMATION`.

## Stack

- `apps/web`: Next.js 16 + React 19 + TypeScript
- `apps/api`: NestJS 12 + BullMQ
- `apps/worker`: BullMQ worker + provider adapter registry
- `packages/database`: Prisma 7 + PostgreSQL + `@prisma/adapter-pg`
- Redis: hàng đợi tác vụ
- PM2: chạy production trên VPS, không dùng Docker

## Yêu cầu

- Node.js >= 22.18
- PostgreSQL >= 16
- Redis >= 7

## Chạy local

```bash
cp .env.example .env
npm install
npm run db:deploy
npm run dev
```

Mặc định:

- Web: `http://localhost:3000`
- API: `http://localhost:4000/api`
- Health: `http://localhost:4000/api/health`

Trước khi lưu credential provider, tạo khóa mã hóa 32 byte:

```bash
openssl rand -hex 32
```

và đặt giá trị đó vào `CONNECTION_ENCRYPTION_KEY` trong `.env`. Secret provider được mã hóa AES-256-GCM trước khi lưu PostgreSQL và không được trả ngược về frontend.

## API MVP

### Campaign

- `GET /api/campaigns` — danh sách campaign + thống kê
- `POST /api/campaigns` — tạo campaign
- `POST /api/campaigns/bootstrap-demo` — tạo Hola Halo mẫu, idempotent
- `GET /api/campaigns/:id` — campaign + content + target + 10 run gần nhất
- `PATCH /api/campaigns/:id` — cập nhật campaign
- `DELETE /api/campaigns/:id` — xóa campaign
- `POST /api/campaigns/:id/content` — thêm content variant
- `POST /api/campaigns/:id/targets` — thêm target
- `PATCH /api/campaigns/:id/targets/:targetId` — cập nhật target và gắn `connectionId`
- `POST /api/campaigns/:id/run` — tạo Dry Run và đưa job vào Redis

### Connections V1

- `GET /api/connections` — danh sách provider connection an toàn, không trả secret
- `POST /api/connections` — tạo connection và mã hóa credential
- `GET /api/connections/:id` — chi tiết connection + target đang dùng
- `PATCH /api/connections/:id` — cập nhật cấu hình/credential
- `DELETE /api/connections/:id` — xóa connection, target liên quan tự bỏ liên kết
- `POST /api/connections/:id/test` — kiểm tra cấu hình provider ở V1, chưa gọi API bên ngoài

Provider V1 hiện có:

- `FACEBOOK_PAGE`
- `WEBSITE`

## Luồng Dry Run + Provider

1. Dashboard đọc campaign và connection từ PostgreSQL qua API.
2. Target API có thể gắn một `ProviderConnection` tương thích.
3. Khi chạy Dry Run, API tạo `CampaignRun` và `PublishJob` trước.
4. BullMQ nhận job với `publishJobId`, `targetId`, `contentVariantId`.
5. Worker chọn provider adapter theo loại target.
6. API target chưa có connection hoặc connection chưa `CONNECTED` dừng ở `WAITING_CONNECTION`.
7. API target có connection hợp lệ dừng ở `READY_FOR_PROVIDER`.
8. Target thủ công dừng ở `AWAITING_CONFIRMATION`.
9. Không có provider nào publish thật trong Connections V1.
10. Khi toàn bộ job đã được chuẩn bị, run chuyển sang `PREPARED`.

## Prisma 7

Connection string nằm trong `.env` và được Prisma CLI đọc qua `prisma.config.ts`. Runtime PostgreSQL dùng `@prisma/adapter-pg`.

```bash
npm run db:generate
npm run db:deploy
npm run db:studio
```

## Triển khai VPS không Docker

Cài Node.js 22, PostgreSQL, Redis và PM2. Sau đó:

```bash
git clone https://github.com/hoanglamvu04/autospace.git
cd autospace
cp .env.example .env
npm install
npm run db:deploy
npm run build
pm2 start ecosystem.config.cjs
pm2 save
```

Trước khi build production, đặt `WEB_ORIGIN` và `NEXT_PUBLIC_API_URL` đúng domain thật. Với Next.js, `NEXT_PUBLIC_API_URL` được đóng vào bundle tại thời điểm build.

## Bước tiếp theo

- Facebook Page provider gọi Graph API thật trên Page được cấp quyền
- Website provider adapter thật cho các CMS/API do người dùng quản lý
- refresh/expiry handling cho token
- scheduler theo ngày/giờ
- event log chi tiết và retry provider
- analytics click/chuyển đổi theo campaign
