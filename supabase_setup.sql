-- ==========================================================================
-- HƯỚNG DẪN TẠO BẢNG SUPABASE CHO TOOL ĐĂNG KÝ NGHỈ PHÉP (THÁNG 7/2026)
-- Copy và dán toàn bộ đoạn code này vào mục "SQL Editor" trên trang Supabase.com
-- ==========================================================================

-- 1. Tạo bảng lưu trữ thông tin đăng ký
CREATE TABLE IF NOT EXISTS registrations (
    date_str VARCHAR(20) PRIMARY KEY, -- Định dạng: "2026-07-01" (Khóa chính đảm bảo 1 người / 1 ngày)
    emp_code VARCHAR(50) NOT NULL,    -- Mã Nhân Viên (VD: NV001)
    emp_name VARCHAR(255) NOT NULL,   -- Tên Nhân Viên (VD: Nguyễn Văn A)
    note TEXT,                        -- Ghi chú nếu có
    created_at VARCHAR(100)           -- Thời gian đăng ký
);

-- 2. Đặt quyền truy cập công khai (Enable Row Level Security - RLS)
ALTER TABLE registrations ENABLE ROW LEVEL SECURITY;

-- 3. Tạo Policy cho phép mọi người đọc và ghi dữ liệu (Read & Write)
CREATE POLICY "Allow public read and write access"
ON registrations
FOR ALL
USING (true)
WITH CHECK (true);

-- 4. Kích hoạt tính năng Realtime (Đồng bộ tức thì giữa các thiết bị)
ALTER PUBLICATION supabase_realtime ADD TABLE registrations;
