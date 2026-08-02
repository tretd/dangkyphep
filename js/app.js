/* ==========================================================================
   Tool Đăng Ký Nghỉ Phép - Tháng 07/2026
   JavaScript Application Core Logic (LocalStorage + Supabase Real-time)
   ========================================================================== */

(function () {
    // ----------------------------------------------------------------------
    // 1. Constants & Default State
    // ----------------------------------------------------------------------
    const TARGET_YEAR = 2026;
    const TARGET_MONTH = 6; // 0-indexed: 6 = July (Tháng 7)
    const DAYS_IN_JULY = 31;

    // Keys for LocalStorage
    const STORAGE_EMPLOYEES = 'leave_app_employees_v1';
    const STORAGE_REGISTRATIONS = 'leave_app_registrations_v1';
    const STORAGE_CONFIG = 'leave_app_config_v1';
    const STORAGE_SUPABASE = 'leave_app_supabase_v1';

    // BroadcastChannel for multi-tab realtime sync (local mode)
    const syncChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('leave_app_sync') : null;

    // Default Initial Employee List
    const DEFAULT_EMPLOYEES = [
        { code: 'NV001', name: 'Nguyễn Văn An' },
        { code: 'NV002', name: 'Trần Thị Bình' },
        { code: 'NV003', name: 'Lê Hoàng Cường' },
        { code: 'NV004', name: 'Phạm Minh Đức' },
        { code: 'NV005', name: 'Hoàng Thị Em' }
    ];

    // Default Time Window Config (Open by default for demo, or set default dates)
    const DEFAULT_CONFIG = {
        startTime: '2026-06-01T00:00',
        endTime: '2026-07-31T23:59',
        isOpenAlways: true
    };

    // State Variables
    let employees = [];
    let registrations = {}; // Format: { "2026-07-01": { empCode: "NV001", empName: "Nguyễn Văn An", note: "Nghỉ phép", time: "2026-08-02 12:00" } }
    let appConfig = { ...DEFAULT_CONFIG };
    let supabaseConfig = { url: '', key: '' };
    let supabaseClient = null;
    let activeFilter = 'all';
    let searchQuery = '';

    // Days of week mapping (Vietnamese)
    const DAY_NAMES = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

    // ----------------------------------------------------------------------
    // 2. DOM Elements
    // ----------------------------------------------------------------------
    const daysListEl = document.getElementById('daysList');
    const searchInput = document.getElementById('searchInput');
    const filterBtns = document.querySelectorAll('.filter-btn');

    // Stats Elements
    const displayTimeWindow = document.getElementById('displayTimeWindow');
    const displayEmpCount = document.getElementById('displayEmpCount');
    const displayRegCount = document.getElementById('displayRegCount');
    const regStatusIndicator = document.getElementById('regStatusIndicator');
    const statusText = document.getElementById('statusText');
    const timeRestrictionAlert = document.getElementById('timeRestrictionAlert');

    // Register Modal Elements
    const registerModal = document.getElementById('registerModal');
    const closeRegisterModal = document.getElementById('closeRegisterModal');
    const btnCancelRegister = document.getElementById('btnCancelRegister');
    const registerForm = document.getElementById('registerForm');
    const modalDateTitle = document.getElementById('modalDateTitle');
    const modalDateInput = document.getElementById('modalDateInput');
    const selectEmployee = document.getElementById('selectEmployee');
    const regNote = document.getElementById('regNote');

    // Admin Modal Elements
    const btnAdminModal = document.getElementById('btnAdminModal');
    const adminModal = document.getElementById('adminModal');
    const closeAdminModal = document.getElementById('closeAdminModal');
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    // Admin Employee Form Elements
    const newEmpId = document.getElementById('newEmpId');
    const newEmpName = document.getElementById('newEmpName');
    const btnAddEmployee = document.getElementById('btnAddEmployee');
    const empTableBody = document.getElementById('empTableBody');
    const empTableCount = document.getElementById('empTableCount');

    // Admin Time Config Elements
    const startTimeInput = document.getElementById('startTimeInput');
    const endTimeInput = document.getElementById('endTimeInput');
    const btnSaveTimeConfig = document.getElementById('btnSaveTimeConfig');
    const btnSetOpenNow = document.getElementById('btnSetOpenNow');
    const btnClearAllRegs = document.getElementById('btnClearAllRegs');

    // Admin Supabase Elements
    const supabaseUrl = document.getElementById('supabaseUrl');
    const supabaseKey = document.getElementById('supabaseKey');
    const btnSaveSupabase = document.getElementById('btnSaveSupabase');
    const btnDisconnectSupabase = document.getElementById('btnDisconnectSupabase');
    const supabaseStatusAlert = document.getElementById('supabaseStatusAlert');

    // Export Button
    const btnExportExcel = document.getElementById('btnExportExcel');

    // ----------------------------------------------------------------------
    // 3. Initialization
    // ----------------------------------------------------------------------
    function init() {
        loadData();
        setupEventListeners();
        initSupabaseIfConfigured();
        checkRegistrationTimeWindow();
        renderDaysList();
        renderEmployeeDropdown();
        renderAdminEmployeeTable();
        updateDashboardStats();

        // Listen for sync messages from other tabs
        if (syncChannel) {
            syncChannel.onmessage = (event) => {
                if (event.data && event.data.type === 'DATA_UPDATED') {
                    loadData();
                    renderDaysList();
                    updateDashboardStats();
                    showToast('Lịch đăng ký vừa được người khác cập nhật!', 'info');
                }
            };
        }

        // Auto-check time window every 30 seconds
        setInterval(checkRegistrationTimeWindow, 30000);
    }

    // Load data from localStorage
    function loadData() {
        const savedEmp = localStorage.getItem(STORAGE_EMPLOYEES);
        employees = savedEmp ? JSON.parse(savedEmp) : [...DEFAULT_EMPLOYEES];

        const savedRegs = localStorage.getItem(STORAGE_REGISTRATIONS);
        registrations = savedRegs ? JSON.parse(savedRegs) : {};

        const savedConfig = localStorage.getItem(STORAGE_CONFIG);
        appConfig = savedConfig ? JSON.parse(savedConfig) : { ...DEFAULT_CONFIG };

        const savedSupa = localStorage.getItem(STORAGE_SUPABASE);
        if (savedSupa) {
            supabaseConfig = JSON.parse(savedSupa);
            supabaseUrl.value = supabaseConfig.url || '';
            supabaseKey.value = supabaseConfig.key || '';
        }

        // Fill time config inputs
        startTimeInput.value = appConfig.startTime || '';
        endTimeInput.value = appConfig.endTime || '';
    }

    function saveData() {
        localStorage.setItem(STORAGE_EMPLOYEES, JSON.stringify(employees));
        localStorage.setItem(STORAGE_REGISTRATIONS, JSON.stringify(registrations));
        localStorage.setItem(STORAGE_CONFIG, JSON.stringify(appConfig));

        // Notify other tabs
        if (syncChannel) {
            syncChannel.postMessage({ type: 'DATA_UPDATED' });
        }
    }

    // ----------------------------------------------------------------------
    // 4. Supabase Cloud Sync Setup
    // ----------------------------------------------------------------------
    function initSupabaseIfConfigured() {
        if (window.supabase && supabaseConfig.url && supabaseConfig.key) {
            try {
                supabaseClient = window.supabase.createClient(supabaseConfig.url, supabaseConfig.key);
                supabaseStatusAlert.innerHTML = `
                    <div class="alert alert-warning" style="background:#ecfdf5; border-color:#a7f3d0; color:#065f46;">
                        <i class="fa-solid fa-cloud-check"></i> Đã kết nối thành công với Supabase Cloud Database!
                    </div>`;

                // Fetch registrations from Supabase
                fetchSupabaseData();
            } catch (err) {
                console.error('Supabase init error:', err);
                supabaseStatusAlert.innerHTML = `<div class="alert alert-warning"><i class="fa-solid fa-triangle-exclamation"></i> Lỗi kết nối Supabase: ${err.message}</div>`;
            }
        } else {
            supabaseStatusAlert.innerHTML = `
                <div class="alert alert-warning" style="background:#f8fafc; border-color:#cbd5e1; color:#475569;">
                    <i class="fa-solid fa-info-circle"></i> Đang chạy ở chế độ **LocalStorage / Multi-Tab Demo**. Thêm URL & Key để bật Cloud Realtime.
                </div>`;
        }
    }

    async function fetchSupabaseData() {
        if (!supabaseClient) return;
        try {
            const { data, error } = await supabaseClient.from('registrations').select('*');
            if (!error && data) {
                const cloudRegs = {};
                data.forEach(item => {
                    cloudRegs[item.date_str] = {
                        empCode: item.emp_code,
                        empName: item.emp_name,
                        note: item.note,
                        time: item.created_at
                    };
                });
                registrations = cloudRegs;
                saveData();
                renderDaysList();
                updateDashboardStats();
            }
        } catch (e) {
            console.log('Supabase table query failed, fallback to local', e);
        }
    }

    // ----------------------------------------------------------------------
    // 5. Time Window & Lock Verification
    // ----------------------------------------------------------------------
    function isWithinTimeWindow() {
        if (appConfig.isOpenAlways) return true;
        const now = new Date();
        const start = appConfig.startTime ? new Date(appConfig.startTime) : null;
        const end = appConfig.endTime ? new Date(appConfig.endTime) : null;

        if (start && now < start) return false;
        if (end && now > end) return false;
        return true;
    }

    function checkRegistrationTimeWindow() {
        const isOpen = isWithinTimeWindow();

        if (isOpen) {
            regStatusIndicator.className = 'status-indicator open';
            statusText.textContent = 'Đang Mở Đăng Ký';
            timeRestrictionAlert.style.display = 'none';
        } else {
            regStatusIndicator.className = 'status-indicator closed';
            statusText.textContent = 'Đã Đóng Đăng Ký';
            timeRestrictionAlert.style.display = 'flex';
        }

        // Display time range label
        if (appConfig.isOpenAlways) {
            displayTimeWindow.textContent = 'Đang mở (Không giới hạn)';
        } else {
            const startStr = appConfig.startTime ? formatDateTimeStr(appConfig.startTime) : '...';
            const endStr = appConfig.endTime ? formatDateTimeStr(appConfig.endTime) : '...';
            displayTimeWindow.textContent = `${startStr} đến ${endStr}`;
        }
    }

    function formatDateTimeStr(isoStr) {
        if (!isoStr) return '';
        const d = new Date(isoStr);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        const hours = String(d.getHours()).padStart(2, '0');
        const mins = String(d.getMinutes()).padStart(2, '0');
        return `${hours}:${mins} ${day}/${month}/${year}`;
    }

    // ----------------------------------------------------------------------
    // 6. Render List of July 2026 Days
    // ----------------------------------------------------------------------
    function renderDaysList() {
        daysListEl.innerHTML = '';

        let totalWorkingDays = 0;
        let registeredCount = 0;

        for (let dayNum = 1; dayNum <= DAYS_IN_JULY; dayNum++) {
            const dateObj = new Date(TARGET_YEAR, TARGET_MONTH, dayNum);
            const dayOfWeekIndex = dateObj.getDay(); // 0 = Sunday
            const dayName = DAY_NAMES[dayOfWeekIndex];
            const isSunday = (dayOfWeekIndex === 0);

            const dateFormatted = `${TARGET_YEAR}-${String(TARGET_MONTH + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
            const displayDateStr = `${String(dayNum).padStart(2, '0')}/07/${TARGET_YEAR}`;

            const existingReg = registrations[dateFormatted];

            if (!isSunday) totalWorkingDays++;
            if (existingReg) registeredCount++;

            // Apply Filters & Search
            if (activeFilter === 'available' && (isSunday || existingReg)) continue;
            if (activeFilter === 'registered' && !existingReg) continue;
            if (activeFilter === 'sunday' && !isSunday) continue;

            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                const matchDay = dayName.toLowerCase().includes(q) || displayDateStr.includes(q);
                const matchEmp = existingReg && (existingReg.empCode.toLowerCase().includes(q) || existingReg.empName.toLowerCase().includes(q));
                if (!matchDay && !matchEmp) continue;
            }

            // Create Day Card DOM Element
            const card = document.createElement('div');
            card.className = `day-card ${isSunday ? 'is-sunday' : ''}`;

            // Left Section: Date Box & Name
            let dateHtml = `
                <div class="day-info">
                    <div class="date-box">
                        <span class="date-num">${String(dayNum).padStart(2, '0')}</span>
                        <span class="date-month">THÁNG 7</span>
                    </div>
                    <div class="day-details">
                        <span class="day-name">${dayName}</span>
                        <span class="full-date-str">${displayDateStr}</span>
                    </div>
                </div>
            `;

            // Middle Section: Status Details
            let detailsHtml = '';
            if (isSunday) {
                detailsHtml = `
                    <div class="reg-details">
                        <span class="sunday-badge">
                            <i class="fa-solid fa-ban"></i> Chủ Nhật - Không cho phép đăng ký
                        </span>
                    </div>
                `;
            } else if (existingReg) {
                detailsHtml = `
                    <div class="reg-details">
                        <div class="registered-badge">
                            <i class="fa-solid fa-circle-check"></i>
                            <div>
                                <div class="emp-code-name">${escapeHtml(existingReg.empCode)} - ${escapeHtml(existingReg.empName)}</div>
                                ${existingReg.note ? `<div style="font-size:12px; color:#047857;">Ghi chú: ${escapeHtml(existingReg.note)}</div>` : ''}
                                <div class="reg-time-stamp">Đã đăng ký lúc: ${existingReg.time || 'N/A'}</div>
                            </div>
                        </div>
                    </div>
                `;
            } else {
                detailsHtml = `
                    <div class="reg-details">
                        <span class="available-tag"><i class="fa-regular fa-circle"></i> Ngày này chưa có ai đăng ký</span>
                    </div>
                `;
            }

            // Right Section: Action Button
            let actionHtml = '';
            if (isSunday) {
                actionHtml = `<button class="btn btn-outline btn-sm" disabled style="opacity:0.5; cursor:not-allowed;"><i class="fa-solid fa-lock"></i> Khóa</button>`;
            } else if (existingReg) {
                actionHtml = `
                    <button class="btn btn-danger btn-sm btn-cancel-reg" data-date="${dateFormatted}">
                        <i class="fa-solid fa-xmark"></i> Hủy Đăng Ký
                    </button>
                `;
            } else {
                const canRegister = isWithinTimeWindow();
                actionHtml = `
                    <button class="btn btn-primary btn-sm btn-open-reg" data-date="${dateFormatted}" data-title="${dayName}, Ngày ${displayDateStr}" ${!canRegister ? 'disabled title="Ngoài thời gian đăng ký"' : ''}>
                        <i class="fa-solid fa-plus"></i> Đăng Ký
                    </button>
                `;
            }

            card.innerHTML = dateHtml + detailsHtml + actionHtml;
            daysListEl.appendChild(card);
        }

        displayRegCount.textContent = `${registeredCount} / ${totalWorkingDays} ngày làm việc`;
    }

    function updateDashboardStats() {
        displayEmpCount.textContent = `${employees.length} nhân viên`;
        empTableCount.textContent = employees.length;
    }

    // ----------------------------------------------------------------------
    // 7. Event Handlers & Registration Flow
    // ----------------------------------------------------------------------
    function setupEventListeners() {
        // Search & Filter
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value;
            renderDaysList();
        });

        filterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                filterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                activeFilter = btn.dataset.filter;
                renderDaysList();
            });
        });

        // Open Register Modal
        daysListEl.addEventListener('click', (e) => {
            const regBtn = e.target.closest('.btn-open-reg');
            if (regBtn) {
                if (!isWithinTimeWindow()) {
                    showToast('Hiện tại không nằm trong khung giờ được phép đăng ký!', 'error');
                    return;
                }
                const dateFormatted = regBtn.dataset.date;
                const titleStr = regBtn.dataset.title;

                // DOUBLE CHECK IF ALREADY REGISTERED BY ANOTHER USER
                if (registrations[dateFormatted]) {
                    showToast(`Rất tiếc! Ngày ${dateFormatted} vừa được người khác đăng ký xong.`, 'error');
                    renderDaysList();
                    return;
                }

                modalDateTitle.textContent = titleStr;
                modalDateInput.value = dateFormatted;
                regNote.value = '';
                selectEmployee.value = '';
                openModal(registerModal);
            }

            const cancelBtn = e.target.closest('.btn-cancel-reg');
            if (cancelBtn) {
                const dateFormatted = cancelBtn.dataset.date;
                if (confirm(`Bạn có chắc chắn muốn hủy lượt đăng ký ngày ${dateFormatted}?`)) {
                    delete registrations[dateFormatted];
                    saveData();
                    if (supabaseClient) {
                        supabaseClient.from('registrations').delete().eq('date_str', dateFormatted);
                    }
                    renderDaysList();
                    showToast(`Đã hủy đăng ký ngày ${dateFormatted}`, 'info');
                }
            }
        });

        // Close Register Modal
        closeRegisterModal.addEventListener('click', () => closeModal(registerModal));
        btnCancelRegister.addEventListener('click', () => closeModal(registerModal));

        // Submit Registration
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const dateStr = modalDateInput.value;
            const selectedEmpVal = selectEmployee.value; // Format: "NV001|Nguyễn Văn An"
            const noteVal = regNote.value.trim();

            if (!selectedEmpVal) {
                showToast('Vui lòng chọn Mã Nhân Viên - Tên Nhân Viên!', 'warning');
                return;
            }

            // RE-VERIFY 1 EMPLOYEE PER DAY RULE
            if (registrations[dateStr]) {
                const existing = registrations[dateStr];
                showToast(`Đã có người khác đăng ký trước! Ngày ${dateStr} đã được đăng ký bởi ${existing.empCode} - ${existing.empName}.`, 'error');
                closeModal(registerModal);
                renderDaysList();
                return;
            }

            const [empCode, empName] = selectedEmpVal.split('|');
            const nowStr = new Date().toLocaleString('vi-VN');

            // Save to state & LocalStorage
            registrations[dateStr] = {
                empCode,
                empName,
                note: noteVal,
                time: nowStr
            };

            saveData();

            // Push to Supabase if connected
            if (supabaseClient) {
                try {
                    await supabaseClient.from('registrations').insert([
                        { date_str: dateStr, emp_code: empCode, emp_name: empName, note: noteVal, created_at: nowStr }
                    ]);
                } catch (err) {
                    console.error('Supabase push error:', err);
                }
            }

            closeModal(registerModal);
            renderDaysList();
            showToast(`Đăng ký thành công cho ${empCode} - ${empName} vào ngày ${dateStr}!`, 'success');
        });

        // Admin Modal Controls
        btnAdminModal.addEventListener('click', () => openModal(adminModal));
        closeAdminModal.addEventListener('click', () => closeModal(adminModal));

        // Admin Tabs switching
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                tabBtns.forEach(b => b.classList.remove('active'));
                tabContents.forEach(c => c.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById(btn.dataset.tab).classList.add('active');
            });
        });

        // Admin Add Employee
        btnAddEmployee.addEventListener('click', () => {
            const code = newEmpId.value.trim().toUpperCase();
            const name = newEmpName.value.trim();

            if (!code || !name) {
                showToast('Vui lòng nhập đầy đủ Mã NV và Tên NV!', 'warning');
                return;
            }

            if (employees.some(e => e.code === code)) {
                showToast(`Mã nhân viên ${code} đã tồn tại trong hệ thống!`, 'error');
                return;
            }

            employees.push({ code, name });
            newEmpId.value = '';
            newEmpName.value = '';
            saveData();
            renderEmployeeDropdown();
            renderAdminEmployeeTable();
            updateDashboardStats();
            showToast(`Đã thêm nhân viên ${code} - ${name}`, 'success');
        });

        // Admin Delete Employee
        empTableBody.addEventListener('click', (e) => {
            const delBtn = e.target.closest('.btn-del-emp');
            if (delBtn) {
                const code = delBtn.dataset.code;
                if (confirm(`Bạn có chắc chắn muốn xóa nhân viên ${code} khỏi danh sách cấu hình?`)) {
                    employees = employees.filter(e => e.code !== code);
                    saveData();
                    renderEmployeeDropdown();
                    renderAdminEmployeeTable();
                    updateDashboardStats();
                    showToast(`Đã xóa nhân viên ${code}`, 'info');
                }
            }
        });

        // Save Time Range Config
        btnSaveTimeConfig.addEventListener('click', () => {
            appConfig.startTime = startTimeInput.value;
            appConfig.endTime = endTimeInput.value;
            appConfig.isOpenAlways = false;
            saveData();
            checkRegistrationTimeWindow();
            renderDaysList();
            showToast('Đã lưu cấu hình khung thời gian đăng ký!', 'success');
        });

        btnSetOpenNow.addEventListener('click', () => {
            appConfig.isOpenAlways = true;
            appConfig.startTime = '';
            appConfig.endTime = '';
            startTimeInput.value = '';
            endTimeInput.value = '';
            saveData();
            checkRegistrationTimeWindow();
            renderDaysList();
            showToast('Đã mở đăng ký tự do không giới hạn thời gian!', 'info');
        });

        // Clear All Registrations
        btnClearAllRegs.addEventListener('click', () => {
            if (confirm('CẢNH BÁO: Hành động này sẽ XÓA TẤT CẢ LƯỢT ĐĂNG KÝ của Tháng 7/2026. Bạn có chắc chắn không?')) {
                registrations = {};
                saveData();
                if (supabaseClient) {
                    supabaseClient.from('registrations').delete().neq('date_str', '');
                }
                renderDaysList();
                showToast('Đã xóa toàn bộ dữ liệu đăng ký Tháng 7/2026!', 'info');
            }
        });

        // Save Supabase Config
        btnSaveSupabase.addEventListener('click', () => {
            supabaseConfig.url = supabaseUrl.value.trim();
            supabaseConfig.key = supabaseKey.value.trim();
            localStorage.setItem(STORAGE_SUPABASE, JSON.stringify(supabaseConfig));
            initSupabaseIfConfigured();
            showToast('Đã lưu thông tin cấu hình Supabase!', 'success');
        });

        btnDisconnectSupabase.addEventListener('click', () => {
            supabaseConfig = { url: '', key: '' };
            localStorage.removeItem(STORAGE_SUPABASE);
            supabaseUrl.value = '';
            supabaseKey.value = '';
            supabaseClient = null;
            initSupabaseIfConfigured();
            showToast('Đã ngắt kết nối Supabase. Chuyển về LocalStorage mode.', 'info');
        });

        // Export to Excel / CSV
        btnExportExcel.addEventListener('click', exportToCSV);
    }

    // ----------------------------------------------------------------------
    // 8. Dynamic Renders
    // ----------------------------------------------------------------------
    function renderEmployeeDropdown() {
        selectEmployee.innerHTML = '<option value="">-- Chọn Mã Nhân Viên - Tên Nhân Viên --</option>';
        employees.forEach(emp => {
            const opt = document.createElement('option');
            opt.value = `${emp.code}|${emp.name}`;
            opt.textContent = `${emp.code} - ${emp.name}`;
            selectEmployee.appendChild(opt);
        });
    }

    function renderAdminEmployeeTable() {
        empTableBody.innerHTML = '';
        if (employees.length === 0) {
            empTableBody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#94a3b8;">Chưa có nhân viên nào trong cấu hình.</td></tr>';
            return;
        }

        employees.forEach((emp, index) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${index + 1}</td>
                <td><strong>${escapeHtml(emp.code)}</strong></td>
                <td>${escapeHtml(emp.name)}</td>
                <td>
                    <button class="btn btn-danger btn-sm btn-del-emp" data-code="${escapeHtml(emp.code)}">
                        <i class="fa-solid fa-trash"></i> Xóa
                    </button>
                </td>
            `;
            empTableBody.appendChild(tr);
        });
    }

    // Export Excel CSV
    function exportToCSV() {
        let csvContent = "\uFEFF"; // UTF-8 BOM for Excel Vietnamese Unicode support
        csvContent += "STT,Ngày Đăng Ký,Thứ,Mã Nhân Viên,Tên Nhân Viên,Ghi Chú,Thời Gian Đăng Ký\n";

        let count = 0;
        for (let dayNum = 1; dayNum <= DAYS_IN_JULY; dayNum++) {
            const dateObj = new Date(TARGET_YEAR, TARGET_MONTH, dayNum);
            const dayOfWeekIndex = dateObj.getDay();
            const dayName = DAY_NAMES[dayOfWeekIndex];
            const dateFormatted = `${TARGET_YEAR}-${String(TARGET_MONTH + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
            const displayDateStr = `${String(dayNum).padStart(2, '0')}/07/${TARGET_YEAR}`;

            const reg = registrations[dateFormatted];

            if (reg) {
                count++;
                csvContent += `${count},"${displayDateStr}","${dayName}","${reg.empCode}","${reg.empName}","${reg.note || ''}","${reg.time || ''}"\n`;
            }
        }

        if (count === 0) {
            showToast('Chưa có dữ liệu đăng ký nào để xuất Excel!', 'warning');
            return;
        }

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `Danh_Sach_Dang_Ky_Nghi_Phep_Thang_07_2026.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast(`Đã xuất file Excel gồm ${count} lượt đăng ký!`, 'success');
    }

    // Modal Helpers
    function openModal(modalEl) {
        modalEl.classList.add('active');
    }

    function closeModal(modalEl) {
        modalEl.classList.remove('active');
    }

    // Toast Notifications
    function showToast(message, type = 'info') {
        const toastContainer = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        let icon = 'fa-info-circle';
        if (type === 'success') icon = 'fa-circle-check';
        if (type === 'error') icon = 'fa-circle-exclamation';
        if (type === 'warning') icon = 'fa-triangle-exclamation';

        toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${escapeHtml(message)}</span>`;
        toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Launch Application
    document.addEventListener('DOMContentLoaded', init);
})();
