-- ==========================================================================
-- HƯỚNG DẪN TẠO BẢNG SUPABASE CHO TOOL ĐĂNG KÝ NGHỈ PHÉP (REALTIME CLOUD SYNC)
-- Copy và dán toàn bộ đoạn code này vào mục "SQL Editor" trên trang Supabase.com
-- ==========================================================================

-- 1. Bảng lưu trữ thông tin đăng ký nghỉ phép
CREATE TABLE IF NOT EXISTS registrations (
    date_str VARCHAR(20) PRIMARY KEY, -- Định dạng: "2026-08-01" (Khóa chính đảm bảo tối đa 1 người / 1 ngày)
    emp_code VARCHAR(50) NOT NULL,    -- Mã Nhân Viên (VD: NV001)
    emp_name VARCHAR(255) NOT NULL,   -- Tên Nhân Viên (VD: Nguyễn Văn A)
    note TEXT,                        -- Ghi chú nếu có
    created_at VARCHAR(100)           -- Thời gian đăng ký
);

-- 2. Bảng lưu trữ cấu hình Tháng, Năm & Khung giờ đếm ngược
CREATE TABLE IF NOT EXISTS app_config (
    id INT PRIMARY KEY DEFAULT 1,
    config_json JSONB NOT NULL,
    updated_at VARCHAR(100)
);

-- 3. Bảng lưu trữ danh sách nhân viên cấu hình
CREATE TABLE IF NOT EXISTS employees (
    code VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    created_at VARCHAR(100)
);

-- 4. Đặt quyền truy cập công khai (Enable Row Level Security - RLS)
ALTER TABLE registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

-- 5. Tạo Policy cho phép mọi người đọc và ghi dữ liệu (Read & Write Public)
DROP POLICY IF EXISTS "Allow public read write registrations" ON registrations;
CREATE POLICY "Allow public read write registrations" ON registrations FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read write app_config" ON app_config;
CREATE POLICY "Allow public read write app_config" ON app_config FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read write employees" ON employees;
CREATE POLICY "Allow public read write employees" ON employees FOR ALL USING (true) WITH CHECK (true);

-- 6. Kích hoạt tính năng Realtime (Đồng bộ tức thì giữa các thiết bị) cho cả 3 bảng
-- Lưu ý: Nếu lệnh ALTER PUBLICATION báo lỗi do bảng đã tồn tại trong publication, có thể bỏ qua hoặc chạy từng dòng add table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'registrations') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE registrations;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'app_config') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE app_config;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'employees') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE employees;
    END IF;
END $$;

