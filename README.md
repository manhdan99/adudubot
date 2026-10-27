# 🛸 Adudu - Trợ Lý AI Ngoài Hành Tinh Cọc Cằn

Ứng dụng web chatbot nhập vai **Adudu** – người ngoài hành tinh đầu vuông kiêu ngạo, cọc cằn, hay chửi cho vui nhưng trả lời cực kỳ chuẩn xác và hữu ích. Giao diện được thiết kế hiện đại, tinh giản theo phong cách **ChatGPT / Claude / Gemini**, hỗ trợ đa cuộc trò chuyện, streaming thời gian thực (SSE), giao diện Sáng / Tối và pop-up hoạt hình tương tác độc đáo.

---

## 🚀 Hướng Dẫn Cài Đặt & Khởi Chạy

### 1. Cài đặt các gói phụ thuộc
```bash
npm install
```

### 2. Tạo file cấu hình `.env`
Tạo file `.env` từ file mẫu `.env.example`:
```bash
cp .env.example .env
```
Mở file `.env` và điền cấu hình (mặc định hỗ trợ Groq hoặc Cerebras):
```env
LLM_API_KEY=your_api_key_here
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_MODEL=qwen/qwen3.8-27b
PORT=3000
```
*(Nếu dùng Cerebras, bạn chỉ cần đổi `LLM_BASE_URL=https://api.cerebras.ai/v1` và `LLM_MODEL=llama3.1-8b`)*.

### 3. Khởi động server
```bash
npm start
```

### 4. Mở ứng dụng
Mở trình duyệt web và truy cập địa chỉ:
```
http://localhost:3000
```

---

## 🌟 Tính Năng Nổi Bật

- **Bố cục hiện đại giống ChatGPT / Claude**: Sidebar lịch sử hội thoại (Hôm nay, Hôm qua, 7 ngày trước), đổi tên, xóa đoạn chat, tạo đoạn chat mới.
- **Phản hồi dạng Streaming (SSE)**: Câu trả lời hiển thị từng từ theo thời gian thực với nút Dừng (Stop) khi đang trả lời.
- **Pop-up Adudu Hiện Hình + Đọc To (Web Speech API)**: Avatar Adudu nảy ra ở giữa màn hình với bong bóng thoại streaming và giọng đọc tiếng Việt hài hước, tự động dừng khi bấm Đóng hoặc phím `Esc`.
- **Theme Sáng / Tối**: Tự động nhận diện theme hệ thống và hỗ trợ chuyển đổi mượt mà với tông màu tối giản, hiện đại, điểm nhấn xanh chanh (`#9dff2e`).
- **Bảo mật tuyệt đối**: API key được bảo vệ hoàn toàn tại backend Node.js (Express), tích hợp Rate Limit (30 req/phút/IP) và kiểm tra độ dài tin nhắn tối đa 2000 ký tự.
- **Responsive 100%**: Trải nghiệm mượt mà trên cả máy tính và điện thoại di động (sidebar trượt dạng drawer).
