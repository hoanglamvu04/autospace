# AutoSpace

AutoSpace là nền tảng quản lý chiến dịch phân phối nội dung: tạo campaign, quản lý biến thể nội dung, xếp hàng tác vụ và theo dõi kết quả. Hệ thống chỉ tự động xuất bản trên các kênh/tài khoản có quyền hợp lệ; các đích cần thao tác người dùng được đưa vào hàng chờ xác nhận.

## Stack

- `apps/web`: Next.js 16 + React 19 + TypeScript
- `apps/api`: NestJS 12 + BullMQ
- `apps/worker`: BullMQ worker
- `packages/database`: PostgreSQL + Prisma 7
- Redis: hàng đợi tác vụ

## Yêu cầu

- Node.js >= 22.18
- PostgreSQL >= 16
- Redis >= 7

## Chạy local

```bash
cp .env.example .env
npm install
npm run db:generate
npm run db:migrate
npm run dev
```

Mặc định:

- Web: http://localhost:3000
- API: http://localhost:4000/api
- Health: http://localhost:4000/api/health

## Luồng MVP

1. Dashboard gửi yêu cầu chạy chiến dịch.
2. API đưa từng target vào queue `campaign-distribution`.
3. Worker phân loại target được phép tự động và target cần xác nhận.
4. Kết quả xử lý được log; bước tiếp theo sẽ lưu job/result vào PostgreSQL và nối provider thực tế.

## Triển khai VPS không Docker

Cài Node.js 22, PostgreSQL, Redis và PM2 trên VPS. Sau đó:

```bash
git clone https://github.com/hoanglamvu04/autospace.git
cd autospace
cp .env.example .env
npm install
npm run db:generate
npm run db:migrate
npm run build
pm2 start ecosystem.config.cjs
pm2 save
```

Khi cấu hình domain thật, đặt `WEB_ORIGIN` và `NEXT_PUBLIC_API_URL` đúng domain trước khi chạy `npm run build`. Có thể đặt `NEXT_PUBLIC_API_URL` trong `apps/web/.env.production.local` để Next.js lấy biến public ở thời điểm build.

## Nguyên tắc tích hợp kênh

Provider chỉ được triển khai tự động khi tài khoản/kênh đã cấp quyền hợp lệ. Các group, website hoặc bề mặt không có API/quyền xuất bản phù hợp sẽ dùng chế độ `MANUAL_CONFIRMATION` thay vì bot giả lập người dùng.
