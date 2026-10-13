# AutoSpace

AutoSpace là trung tâm quản lý chiến dịch phân phối nội dung: tạo campaign, quản lý content variant, target, xếp hàng BullMQ và theo dõi trạng thái từng job trong PostgreSQL.

Hệ thống chỉ tự động xuất bản khi một provider có API/quyền hợp lệ. Target chưa có provider phù hợp sẽ dừng ở `READY_FOR_PROVIDER` hoặc `AWAITING_CONFIRMATION`, không giả lập rằng bài đã được đăng thành công.

## Stack

- `apps/web`: Next.js 16 + React 19 + TypeScript
- `apps/api`: NestJS 12 + BullMQ
- `apps/worker`: BullMQ worker
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

Lần đầu mở dashboard, bấm **Tạo Hola Halo**. API sẽ tạo dữ liệu mẫu trực tiếp trong PostgreSQL gồm campaign, content variant và target. Sau đó dashboard không còn dùng dữ liệu hard-code.

## API MVP

- `GET /api/campaigns` — danh sách campaign + thống kê
- `POST /api/campaigns` — tạo campaign
- `POST /api/campaigns/bootstrap-demo` — tạo Hola Halo mẫu, idempotent
- `GET /api/campaigns/:id` — campaign + content + target + 10 run gần nhất
- `PATCH /api/campaigns/:id` — cập nhật campaign
- `DELETE /api/campaigns/:id` — xóa campaign
- `POST /api/campaigns/:id/content` — thêm content variant
- `POST /api/campaigns/:id/targets` — thêm target
- `DELETE /api/campaigns/:id/targets/:targetId` — ngừng target, không xóa lịch sử job
- `POST /api/campaigns/:id/run` — tạo CampaignRun, gán content cho từng target và đưa job vào Redis

## Luồng dữ liệu

1. Dashboard đọc campaign từ PostgreSQL qua API.
2. Khi chạy chiến dịch, API tạo `CampaignRun` và `PublishJob` trước.
3. Mỗi target được gán một `ContentVariant` theo vòng lặp.
4. BullMQ nhận job với `publishJobId`, `targetId`, `contentVariantId`.
5. Worker cập nhật trạng thái job ngược lại PostgreSQL.
6. Target `API` chưa gắn provider thật dừng ở `READY_FOR_PROVIDER`.
7. Target cần thao tác người dùng dừng ở `AWAITING_CONFIRMATION`.
8. Khi toàn bộ job đã được chuẩn bị, run chuyển sang `PREPARED`.

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

- màn hình CRUD campaign/content/target đầy đủ
- provider adapter cho Facebook Page được cấp quyền hợp lệ
- scheduler theo ngày/giờ
- retry và event log chi tiết
- xác nhận thủ công cho target không có API xuất bản phù hợp
- thống kê click/chuyển đổi theo campaign
