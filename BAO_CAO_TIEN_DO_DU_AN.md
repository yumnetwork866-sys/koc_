# BÁO CÁO TIẾN ĐỘ DỰ ÁN CONTENT PERFORMANCE & SOCIAL COMMERCE

**Ngày báo cáo:** 14/07/2026  
**Phạm vi:** Toàn bộ hệ thống frontend, backend, database và các tích hợp TikTok/Facebook hiện có  
**Trạng thái tổng quan:** MVP đã vận hành được các luồng nghiệp vụ chính; một số API nâng cao và hạng mục production-hardening cần tiếp tục hoàn thiện.

## 1. Tóm tắt điều hành

Hệ thống hiện đã hình thành một nền tảng quản lý nội dung và hiệu suất đa kênh, tập trung vào TikTok, TikTok Shop Creator/Affiliate và Facebook Page Chatbot. Các luồng cốt lõi đã có gồm quản lý user/KOC, kết nối TikTok OAuth, đồng bộ video, tính KPI, quản lý booking, báo cáo tuần, Facebook inbox/chatbot và OAuth đa Creator cho TikTok Shop Partner.

Điểm nâng cấp gần nhất là TikTok Shop Partner đã chuyển từ mô hình một access token dùng chung sang OAuth đa Creator. Mỗi Creator tự authorize, hệ thống tự tạo user KOC, mã hóa token và lưu riêng trong database. Trang KOC có thể hiển thị Creator Profile, quyền affiliate và sản phẩm showcase.

Hệ thống đã đủ nền tảng để tiếp tục pilot nội bộ. Tuy nhiên, trước khi mở rộng vận hành chính thức cần ưu tiên xử lý độ ổn định khi deploy frontend, bổ sung giám sát lỗi, hoàn thiện Seller OAuth cho Shop Analytics và triển khai các scope TikTok Shop đã được duyệt nhưng chưa sử dụng.

## 2. Các phần đã hoàn thành

### 2.1. Nền tảng hệ thống và bảo mật

- Frontend React/Vite, giao diện responsive, hỗ trợ tiếng Việt và tiếng Anh.
- Backend Node.js/Express, REST API và PostgreSQL/Sequelize.
- Đăng nhập admin, session token có chữ ký và route bảo vệ theo quyền admin.
- Cấu hình bí mật được tách qua biến môi trường.
- Token TikTok được mã hóa AES-256-GCM trước khi lưu database.
- Hệ thống migration có version, backup PostgreSQL trước khi migrate/rollback.
- Có trang công khai Terms, Privacy và Data Deletion phục vụ quá trình review nền tảng.

### 2.2. Quản lý user và KOC

- CRUD user: tạo, xem, sửa và xóa.
- Phân loại role gồm admin, leader, member và KOC.
- Trang KOC Performance có tìm kiếm, sắp xếp và KPI theo từng KOC.
- Chỉ số hiện có: số video, tổng view, trung bình view/video, tỷ lệ video trên 10.000 view và top video.
- Giao diện lọc và sắp xếp đã tối ưu về cùng một hàng trên desktop.

### 2.3. TikTok Login Kit/Display API

- Kết nối TikTok channel bằng OAuth phía backend.
- Kiểm tra OAuth state và xử lý callback.
- Mã hóa access token/refresh token.
- Tự refresh access token khi gần hết hạn.
- Đồng bộ thông tin channel, profile và video.
- Lưu các metric video: view, like, comment và share.
- Cho phép đồng bộ thủ công theo channel.
- Có scheduler đồng bộ TikTok hằng ngày, cấu hình cron/timezone/concurrency.
- Có advisory lock PostgreSQL để tránh job đồng bộ chạy trùng.
- Có revoke và disconnect channel.

### 2.4. TikTok Shop Partner – OAuth đa Creator

- App Key/App Secret dùng chung được giữ ở backend.
- Creator authorize độc lập, không cần chọn user KOC nhập tay trước.
- Callback tự gọi Creator Profile, lấy `open_id` và username.
- Hệ thống tự tạo user mới với role KOC từ tài khoản TikTok Creator.
- Cùng một `open_id` authorize lại sẽ cập nhật user/token cũ, không tạo trùng.
- Access token và refresh token được mã hóa và lưu riêng theo từng Creator.
- Tự refresh token khi access token sắp hết hạn.
- Có trạng thái kết nối, xem dữ liệu và ngắt kết nối theo KOC.
- Đã tích hợp Creator Profile: username, khu vực và affiliate permissions.
- Đã tích hợp Showcase Products: sản phẩm, shop, giá và tổng số sản phẩm.
- Đã tích hợp Target Collaborations cho Booking: collaboration, sản phẩm, trạng thái và commission.
- OAuth callback có thể quay lại đúng trang Booking hoặc KOC Performance.

### 2.5. Booking

- CRUD booking.
- Gắn staff, KOC, chi phí, deadline và video vào booking.
- Chọn nhiều video từ thư viện hiện có.
- Lọc video theo channel và tìm kiếm video.
- Hiển thị tổng view, like và share của video trong booking.
- Kết nối TikTok Creator mới trực tiếp từ khu vực Booking.
- Đồng bộ target collaboration và chọn sản phẩm affiliate để gắn vào booking.

### 2.6. Dashboard và KPI

- Dashboard tổng quan user, video, view, like, comment và share.
- KPI theo user/KOC.
- KPI theo sản phẩm.
- Top video và top KOC.
- Dữ liệu KPI được tổng hợp trực tiếp từ PostgreSQL.

### 2.7. Quản lý video, sản phẩm và phân công

- CRUD video qua backend.
- Lưu channel, platform video ID, link, thumbnail và thời gian đăng.
- Lưu campaign, content type và duration.
- Quan hệ nhiều-nhiều giữa video và sản phẩm.
- Backend có CRUD sản phẩm.
- Backend có chức năng phân công video cho user.
- Có API import channel/video/product từ payload chuẩn hóa.

### 2.8. Báo cáo tuần

- Tạo và lưu báo cáo theo khoảng tuần.
- Tổng hợp tổng video, tổng view và average view/video.
- Liệt kê top video và sản phẩm nổi bật.
- Có phần nhận định tự động dựa trên dữ liệu hiện có.
- CRUD báo cáo và xem lại lịch sử báo cáo.

### 2.9. Facebook Page Chatbot

- Facebook OAuth và callback.
- Lấy danh sách Page được quản lý và kết nối/ngắt Page.
- Webhook xác minh và nhận message/event.
- Danh sách hội thoại và tin nhắn.
- Gửi tin nhắn thủ công.
- Quản lý session Facebook user/page.
- Dashboard thống kê chatbot.
- Quản lý đơn hàng và cập nhật trạng thái đơn.
- Knowledge base: tạo, xem và xóa tài liệu.
- Chat settings và chọn model.
- Hỗ trợ Gemini hoặc Ollama theo cấu hình.
- Có chức năng revoke tài khoản Facebook và dọn dữ liệu liên quan.

### 2.10. AI Assistant nội bộ

- Chat assistant trong giao diện quản trị.
- Có thể sử dụng Gemini hoặc Ollama.
- Cho phép cấu hình provider, model và Ollama host.
- Có fallback và gợi ý prompt trên giao diện.

### 2.11. Kiểm thử và xác minh hiện tại

- Backend: 14/14 automated tests đang pass.
- Frontend: production build thành công.
- Lint không có lỗi blocking; còn một số warning kỹ thuật cũ cần dọn dần.
- Migration TikTok Partner đã được áp dụng vào database hiện tại.
- Database đã có ràng buộc chống trùng TikTok Creator `open_id`.

## 3. Các phần chưa làm được hoặc cần update sau

### 3.1. Ưu tiên cao

#### A. TikTok Shop Analytics chưa được tích hợp

- Scope `data.shop_analytics.public.read` đã có nhưng API Analytics yêu cầu Seller OAuth token.
- Hệ thống hiện mới có Creator OAuth token.
- Cần phát triển OAuth đa Seller/Shop riêng, lưu seller token và shop binding.
- Sau khi hoàn thành có thể lấy GMV, order, item sold, impression, CTR, conversion, video/product performance và creator attribution.

#### B. Các scope TikTok Creator đã duyệt nhưng chưa dùng hết

- `creator.data.live.read.public`: chưa có màn hình Live Data và live performance.
- `creator.affiliate.link.write`: chưa tạo/quản lý affiliate tracking link.
- `creator.showcase.write`: chưa thêm, xóa hoặc sắp xếp sản phẩm showcase từ hệ thống.
- `creator.affiliate_collaboration.read`: mới dùng target collaboration; chưa lấy affiliate orders và open collaboration đầy đủ.
- Chưa có đồng bộ nền định kỳ cho Creator Profile, showcase, collaboration và affiliate order.

#### C. Độ ổn định frontend sau deploy

- Frontend đang lazy-load từng page theo file chunk có hash.
- Khi deploy phiên bản mới, trình duyệt đang giữ bundle cũ có thể yêu cầu chunk đã bị xóa và hiển thị trang trắng đến khi hard refresh.
- Chưa có Error Boundary để bắt lỗi render/chunk load.
- Cần cấu hình cache đúng cho `index.html` và `/assets`, deploy atomic/giữ asset cũ và thêm cơ chế retry/reload chunk.

#### D. Production monitoring và audit

- Chưa có hệ thống theo dõi lỗi tập trung như Sentry.
- Chưa có structured logging, alert và dashboard theo dõi job/API.
- Chưa có audit log cho hành động admin, kết nối OAuth, thay đổi booking hoặc xóa dữ liệu.
- Chưa có rate limit và cơ chế chống abuse cho các endpoint public callback/webhook.

### 3.2. Ưu tiên trung bình

#### A. TikTok webhook

- Endpoint webhook hiện mới ghi log và trả HTTP 200.
- Chưa xác thực chữ ký webhook.
- Chưa xử lý event để cập nhật dữ liệu hoặc kích hoạt đồng bộ.

#### B. Crawler và đa nền tảng

- UI có nhắc đến crawler nhưng chưa có crawler thực tế.
- YouTube hiện mới là placeholder “Coming soon”.
- Chưa có OAuth/sync chính thức cho YouTube, Instagram hoặc nền tảng khác.

#### C. Assignment và Product UI

- Backend đã có assignment và product API.
- Assignment component đã tồn tại nhưng chưa được đưa vào navigation/route chính hiện tại.
- Chưa có trang quản lý sản phẩm độc lập hoàn chỉnh.

#### D. Báo cáo AI

- Phần “Nhận định AI” trong báo cáo tuần hiện là nội dung rule-based cố định dựa trên KPI.
- Chưa gọi Gemini/Ollama để phân tích báo cáo thực sự.
- Chưa có so sánh tuần trước, mục tiêu/KPI plan, export PDF/Excel hoặc gửi báo cáo tự động.

#### E. Booking nâng cao

- Chưa có workflow phê duyệt booking nhiều bước.
- Chưa có notification, nhắc deadline hoặc lịch sử thay đổi.
- Chưa đồng bộ trạng thái booking với affiliate order/conversion.
- Chưa chuẩn hóa đa tiền tệ giữa booking cost và commission TikTok Shop.

### 3.3. Kỹ thuật và chất lượng cần tiếp tục cải thiện

- Bổ sung integration test cho callback OAuth thực tế và database transaction.
- Bổ sung end-to-end test cho các luồng login, connect Creator, Booking và Facebook Chat.
- Dọn các lint warning còn lại.
- Tách service/module lớn, đặc biệt Facebook Chatbot controller.
- Chuẩn hóa validation request và schema response.
- Thêm pagination cho các danh sách lớn.
- Bổ sung cơ chế retry/backoff khi TikTok/Meta API giới hạn request.
- Tài liệu README chưa phản ánh đầy đủ luồng TikTok Shop Partner mới.
- Cần quy trình CI/CD tự động chạy test, build, migrate và rollback an toàn.

## 4. Rủi ro và phụ thuộc

| Rủi ro/phụ thuộc | Tác động | Hướng xử lý |
|---|---|---|
| TikTok/Meta thay đổi API hoặc policy | Có thể làm OAuth/sync lỗi | Theo dõi changelog, version endpoint và regression test |
| Creator/Seller chưa grant đủ scope | API trả lỗi quyền hoặc thiếu dữ liệu | Kiểm tra `granted_scopes`, yêu cầu authorize lại |
| Chưa có Seller OAuth | Không lấy được Shop Analytics | Ưu tiên phát triển OAuth đa Seller |
| Token hết hạn/revoke | Mất đồng bộ theo user | Tự refresh, cảnh báo reconnect, job kiểm tra token |
| Deploy xóa chunk frontend cũ | Người dùng gặp trang trắng | Cache policy, Error Boundary và atomic deploy |
| Dữ liệu tăng nhanh | Trang/API chậm | Pagination, index, cache và background sync |
| Thiếu monitoring | Khó phát hiện lỗi sớm | Sentry/log aggregation/alert |

## 5. Đề xuất roadmap

### Giai đoạn 1 – Ổn định vận hành

1. Khắc phục lỗi trắng trang do chunk/cache và thêm Error Boundary.
2. Bổ sung monitoring, structured log và cảnh báo job/API.
3. Hoàn thiện validation, rate limit và bảo vệ callback/webhook.
4. Cập nhật tài liệu triển khai và checklist production.

### Giai đoạn 2 – Hoàn thiện dữ liệu TikTok Shop

1. OAuth đa Seller/Shop.
2. Shop Analytics: GMV, order, conversion, product/video performance.
3. Affiliate orders và đối soát theo Creator/Booking.
4. Live Data dashboard.
5. Tracking link và quản lý showcase.

### Giai đoạn 3 – Tự động hóa và mở rộng

1. Scheduler đồng bộ TikTok Partner.
2. Notification deadline và workflow booking.
3. Báo cáo AI thực sự, export và gửi tự động.
4. Hoàn thiện assignment/product UI.
5. Bổ sung YouTube và các nền tảng tiếp theo.

## 6. Đề xuất quyết định cho giai đoạn tiếp theo

Đề xuất ưu tiên theo thứ tự:

1. **Ổn định frontend và monitoring** để giảm lỗi ảnh hưởng người dùng.
2. **Seller OAuth + Shop Analytics** để tạo giá trị kinh doanh trực tiếp từ GMV, order và conversion.
3. **Affiliate Orders gắn với Booking/KOC** để đo hiệu quả và đối soát.
4. **Live Data + Showcase/Tracking Link** để sử dụng hết scope TikTok đã được duyệt.
5. **Báo cáo AI và tự động hóa vận hành** sau khi dữ liệu nền đã đầy đủ, ổn định.

## 7. Kết luận

Dự án đã hoàn thành phần lớn nền tảng quản trị nội dung, KPI, booking, TikTok channel, TikTok Shop Creator và Facebook Chatbot. Kiến trúc OAuth đa Creator và lưu token mã hóa trong database là nền tảng phù hợp để mở rộng lên nhiều KOC.

Khoảng trống lớn nhất hiện tại không nằm ở CRUD cơ bản mà nằm ở dữ liệu thương mại nâng cao, độ ổn định production và tự động hóa. Nếu hoàn thành Seller OAuth, Shop Analytics, affiliate order và monitoring, hệ thống có thể chuyển từ công cụ quản lý nội bộ sang nền tảng theo dõi hiệu quả social commerce đầy đủ hơn.

## 8. Đánh giá ngắn theo trạng thái hiện tại

### Điểm mạnh

- Kiến trúc hiện tại đã đủ để vận hành nội bộ: React/Vite, Express, PostgreSQL, phân quyền cơ bản và OAuth cho cả TikTok Creator lẫn TikTok Shop.
- Luồng dữ liệu chính đã rõ: video, KPI, booking, KOC Performance, Shop Analytics, Facebook chatbot.
- Token nhạy cảm đã được mã hóa, có migration/versioning và đã có test tự động ở cả backend lẫn build frontend.

### Phần chưa đạt mức production-ready

- Shop Analytics vẫn phụ thuộc Seller OAuth riêng; đây là khoảng trống lớn nhất nếu muốn đi vào số liệu commerce thật sự.
- Chưa có monitoring/alert/audit log đủ rõ để xử lý sự cố production và truy vết thao tác admin.
- Frontend còn rủi ro khi deploy theo chunk/cache nếu không có chiến lược atomic deploy hoặc cơ chế reload/retry.
- Một số luồng nâng cao mới dừng ở mức nền tảng: webhook validation, affiliate order, live data, tracking link, workflow booking nhiều bước.

### Nên cải thiện tiếp

- Ưu tiên 1: ổn định deploy frontend, thêm Error Boundary, retry chunk load và giám sát lỗi.
- Ưu tiên 2: hoàn thiện Seller OAuth + Shop Analytics để có GMV/order/conversion thật.
- Ưu tiên 3: nối dữ liệu affiliate order, booking và performance để đo hiệu quả KOC end-to-end.
- Ưu tiên 4: chuẩn hóa webhook, audit log, rate limit và validation để giảm rủi ro vận hành.
- Ưu tiên 5: mở rộng automation cho báo cáo tuần, cảnh báo deadline và đồng bộ nền định kỳ.
