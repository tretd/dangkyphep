-- ==========================================================================
-- HƯỚNG DẪN TẠO BẢNG SUPABASE CHO TOOL ĐĂNG KÝ NGHỈ PHÉP (HỖ TRỢ DUYỆT LỊCH & LÝ DO)
-- Copy và dán toàn bộ đoạn code này vào mục "SQL Editor" trên trang Supabase.com
-- ==========================================================================

-- 1. Bảng lưu trữ thông tin đơn đăng ký nghỉ phép (Hỗ trợ nhiều đơn/ngày, lý do & trạng thái duyệt)
CREATE TABLE IF NOT EXISTS registrations (
    id VARCHAR(100) PRIMARY KEY,         -- Mã đơn duy nhất (VD: reg_1722700000_nv001)
    date_str VARCHAR(20) NOT NULL,        -- Ngày xin nghỉ: "2026-08-01"
    emp_code VARCHAR(50) NOT NULL,        -- Mã Nhân Viên (VD: NV001)
    emp_name VARCHAR(255) NOT NULL,       -- Tên Nhân Viên (VD: Nguyễn Văn A)
    reason TEXT NOT NULL,                 -- Lý do xin nghỉ phép
    status VARCHAR(20) DEFAULT 'pending', -- Trạng thái: 'pending' (Chờ duyệt), 'approved' (Đã duyệt), 'rejected' (Từ chối)
    admin_note TEXT,                      -- Ghi chú Trưởng nhóm
    created_at VARCHAR(100)               -- Thời gian tạo đơn
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

-- 4. Bật quyền đọc/ghi công khai (Enable Row Level Security - RLS)
ALTER TABLE registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

-- 5. Tạo Policy cho phép mọi người đọc và ghi dữ liệu công khai (Public Read/Write)
DROP POLICY IF EXISTS "Allow public read write registrations" ON registrations;
CREATE POLICY "Allow public read write registrations" ON registrations FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read write app_config" ON app_config;
CREATE POLICY "Allow public read write app_config" ON app_config FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read write employees" ON employees;
CREATE POLICY "Allow public read write employees" ON employees FOR ALL USING (true) WITH CHECK (true);

-- 6. Nạp dữ liệu mặc định ban đầu nếu bảng còn trống
INSERT INTO app_config (id, config_json, updated_at)
VALUES (1, '{"targetMonth": 7, "targetYear": 2026, "startTime": "", "endTime": "", "isOpenAlways": true}', NOW()::text)
ON CONFLICT (id) DO NOTHING;

INSERT INTO employees (code, name, created_at)
VALUES 
    ('NV001', 'Nguyễn Văn An', NOW()::text),
    ('NV002', 'Trần Thị Bình', NOW()::text),
    ('NV003', 'Lê Hoàng Cường', NOW()::text),
    ('NV004', 'Phạm Minh Đức', NOW()::text),
    ('NV005', 'Hoàng Thị Em', NOW()::text)
ON CONFLICT (code) DO NOTHING;

-- 7. Kích hoạt tính năng Realtime phát sóng tức thời (Realtime Subscription) cho cả 3 bảng
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



