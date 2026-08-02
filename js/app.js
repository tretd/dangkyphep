/* ==========================================================================
   Tool Đăng Ký Nghỉ Phép - Tháng 07/2026
   JavaScript Application Core (Light Theme + Compact Grid Cards + Admin Only Cancel)
   ========================================================================== */

(function () {
    // ----------------------------------------------------------------------
    // 1. Constants & State
    // ----------------------------------------------------------------------
    const TARGET_YEAR = 2026;
    const TARGET_MONTH = 6; // 0-indexed: 6 = July
    const DAYS_IN_JULY = 31;
    const ADMIN_PASSCODE = 'Cuong@032';

    const STORAGE_EMPLOYEES = 'leave_app_employees_v3';
    const STORAGE_REGISTRATIONS = 'leave_app_registrations_v3';
    const STORAGE_CONFIG = 'leave_app_config_v3';
    const STORAGE_SUPABASE = 'leave_app_supabase_v3';

    const syncChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('leave_app_sync_v3') : null;

    const DEFAULT_EMPLOYEES = [
        { code: 'NV001', name: 'Nguyễn Văn An' },
        { code: 'NV002', name: 'Trần Thị Bình' },
        { code: 'NV003', name: 'Lê Hoàng Cường' },
        { code: 'NV004', name: 'Phạm Minh Đức' },
        { code: 'NV005', name: 'Hoàng Thị Em' }
    ];

    const DEFAULT_CONFIG = {
        startTime: '',
        endTime: '',
        isOpenAlways: true
    };

    let employees = [];
    let registrations = {};
    let appConfig = { ...DEFAULT_CONFIG };
    let supabaseConfig = { url: '', key: '' };
    let supabaseClient = null;
    let activeFilter = 'all';
    let searchQuery = '';
    let timerInterval = null;

    const DAY_NAMES = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

    // ----------------------------------------------------------------------
    // 2. DOM Elements
    // ----------------------------------------------------------------------
    const daysListEl = document.getElementById('daysList');
    const searchInput = document.getElementById('searchInput');
    const filterBtns = document.querySelectorAll('.filter-btn');
    const regStatusIndicator = document.getElementById('regStatusIndicator');
    const statusText = document.getElementById('statusText');

    // Countdown Overlay
    const countdownOverlay = document.getElementById('countdownOverlay');
    const cdDescText = document.getElementById('cdDescText');
    const cdDays = document.getElementById('cdDays');
    const cdHours = document.getElementById('cdHours');
    const cdMins = document.getElementById('cdMins');
    const cdSecs = document.getElementById('cdSecs');

    // Key & Passcode Modal
    const btnAdminKey = document.getElementById('btnAdminKey');
    const passwordModal = document.getElementById('passwordModal');
    const closePasswordModal = document.getElementById('closePasswordModal');
    const btnCancelPass = document.getElementById('btnCancelPass');
    const passwordForm = document.getElementById('passwordForm');
    const adminPassInput = document.getElementById('adminPassInput');
    const passErrorMsg = document.getElementById('passErrorMsg');

    // Register Modal
    const registerModal = document.getElementById('registerModal');
    const closeRegisterModal = document.getElementById('closeRegisterModal');
    const btnCancelRegister = document.getElementById('btnCancelRegister');
    const registerForm = document.getElementById('registerForm');
    const modalDateTitle = document.getElementById('modalDateTitle');
    const modalDateInput = document.getElementById('modalDateInput');
    const selectEmployee = document.getElementById('selectEmployee');
    const regNote = document.getElementById('regNote');

    // Admin Modal
    const adminModal = document.getElementById('adminModal');
    const closeAdminModal = document.getElementById('closeAdminModal');
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    // Admin Tabs Content
    const newEmpId = document.getElementById('newEmpId');
    const newEmpName = document.getElementById('newEmpName');
    const btnAddEmployee = document.getElementById('btnAddEmployee');
    const empTableBody = document.getElementById('empTableBody');
    const empTableCount = document.getElementById('empTableCount');
    const adminRegsTableBody = document.getElementById('adminRegsTableBody');

    const startTimeInput = document.getElementById('startTimeInput');
    const endTimeInput = document.getElementById('endTimeInput');
    const btnSaveTimeConfig = document.getElementById('btnSaveTimeConfig');
    const btnSetOpenNow = document.getElementById('btnSetOpenNow');
    const btnClearAllRegs = document.getElementById('btnClearAllRegs');

    const supabaseUrl = document.getElementById('supabaseUrl');
    const supabaseKey = document.getElementById('supabaseKey');
    const btnSaveSupabase = document.getElementById('btnSaveSupabase');
    const btnDisconnectSupabase = document.getElementById('btnDisconnectSupabase');
    const supabaseStatusAlert = document.getElementById('supabaseStatusAlert');
    const btnExportExcel = document.getElementById('btnExportExcel');

    // ----------------------------------------------------------------------
    // 3. Initialization
    // ----------------------------------------------------------------------
    function init() {
        loadData();
        setupEventListeners();
        initSupabaseIfConfigured();
        renderDaysGrid();
        renderEmployeeDropdown();
        renderAdminEmployeeTable();
        renderAdminRegsTable();
        updateDashboardStats();

        startCountdownTicker();

        if (syncChannel) {
            syncChannel.onmessage = (event) => {
                if (event.data && event.data.type === 'DATA_UPDATED') {
                    loadData();
                    renderDaysGrid();
                    renderAdminRegsTable();
                    updateDashboardStats();
                    showToast('Dữ liệu vừa được cập nhật từ thiết bị khác!', 'info');
                }
            };
        }
    }

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

        startTimeInput.value = appConfig.startTime || '';
        endTimeInput.value = appConfig.endTime || '';
    }

    function saveData() {
        localStorage.setItem(STORAGE_EMPLOYEES, JSON.stringify(employees));
        localStorage.setItem(STORAGE_REGISTRATIONS, JSON.stringify(registrations));
        localStorage.setItem(STORAGE_CONFIG, JSON.stringify(appConfig));

        if (syncChannel) {
            syncChannel.postMessage({ type: 'DATA_UPDATED' });
        }
    }

    // ----------------------------------------------------------------------
    // 4. Supabase Realtime Integration
    // ----------------------------------------------------------------------
    function initSupabaseIfConfigured() {
        if (window.supabase && supabaseConfig.url && supabaseConfig.key) {
            try {
                supabaseClient = window.supabase.createClient(supabaseConfig.url, supabaseConfig.key);
                supabaseStatusAlert.innerHTML = `
                    <div class="alert alert-warning" style="background:#ecfdf5; border-color:#a7f3d0; color:#047857;">
                        <i class="fa-solid fa-cloud-check"></i> Đã kết nối Supabase Cloud thành công!
                    </div>`;
                fetchSupabaseData();
            } catch (err) {
                supabaseStatusAlert.innerHTML = `<div class="alert alert-warning" style="color:#dc2626;"><i class="fa-solid fa-triangle-exclamation"></i> Lỗi kết nối Supabase: ${err.message}</div>`;
            }
        } else {
            supabaseStatusAlert.innerHTML = `
                <div class="alert alert-warning" style="background:#f8fafc; border-color:#cbd5e1; color:#64748b;">
                    <i class="fa-solid fa-info-circle"></i> Đang chạy ở chế độ **Local Demo**. Thêm URL & Key để bật Cloud Realtime.
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
                renderDaysGrid();
                renderAdminRegsTable();
            }
        } catch (e) {
            console.log('Supabase sync error', e);
        }
    }

    // ----------------------------------------------------------------------
    // 5. Countdown Ticker Logic
    // ----------------------------------------------------------------------
    function startCountdownTicker() {
        if (timerInterval) clearInterval(timerInterval);
        checkTimeAndTicker();
        timerInterval = setInterval(checkTimeAndTicker, 1000);
    }

    function checkTimeAndTicker() {
        const now = new Date();

        if (appConfig.isOpenAlways) {
            countdownOverlay.style.display = 'none';
            regStatusIndicator.className = 'status-indicator open';
            statusText.textContent = 'Đang Mở Đăng Ký';
            return;
        }

        const start = appConfig.startTime ? new Date(appConfig.startTime) : null;
        const end = appConfig.endTime ? new Date(appConfig.endTime) : null;

        if (start && now < start) {
            countdownOverlay.style.display = 'flex';
            regStatusIndicator.className = 'status-indicator closed';
            statusText.textContent = 'Chưa Đếm Xong';

            const diff = start - now;
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const secs = Math.floor((diff % (1000 * 60)) / 1000);

            cdDays.textContent = String(days).padStart(2, '0');
            cdHours.textContent = String(hours).padStart(2, '0');
            cdMins.textContent = String(mins).padStart(2, '0');
            cdSecs.textContent = String(secs).padStart(2, '0');

            cdDescText.textContent = `Hệ thống sẽ tự động mở cổng đăng ký vào lúc: ${formatDateTime(start)}`;
            return;
        }

        if (end && now > end) {
            countdownOverlay.style.display = 'flex';
            regStatusIndicator.className = 'status-indicator closed';
            statusText.textContent = 'Đã Hết Hạn';

            cdDays.textContent = '00';
            cdHours.textContent = '00';
            cdMins.textContent = '00';
            cdSecs.textContent = '00';
            cdDescText.textContent = `Thời gian đăng ký đã kết thúc lúc: ${formatDateTime(end)}`;
            return;
        }

        countdownOverlay.style.display = 'none';
        regStatusIndicator.className = 'status-indicator open';
        statusText.textContent = 'Đang Mở Đăng Ký';
    }

    function formatDateTime(d) {
        if (!d) return '';
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        const hours = String(d.getHours()).padStart(2, '0');
        const mins = String(d.getMinutes()).padStart(2, '0');
        return `${hours}:${mins} - ${day}/${month}/${year}`;
    }

    // ----------------------------------------------------------------------
    // 6. Render Compact Card Grid Layout
    // ----------------------------------------------------------------------
    function renderDaysGrid() {
        daysListEl.innerHTML = '';

        for (let dayNum = 1; dayNum <= DAYS_IN_JULY; dayNum++) {
            const dateObj = new Date(TARGET_YEAR, TARGET_MONTH, dayNum);
            const dayOfWeekIndex = dateObj.getDay();
            const dayName = DAY_NAMES[dayOfWeekIndex];
            const isSunday = (dayOfWeekIndex === 0);

            const dateFormatted = `${TARGET_YEAR}-${String(TARGET_MONTH + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
            const displayDateStr = `${String(dayNum).padStart(2, '0')}/07`;
            const existingReg = registrations[dateFormatted];

            // Filter logic
            if (activeFilter === 'available' && (isSunday || existingReg)) continue;
            if (activeFilter === 'registered' && !existingReg) continue;
            if (activeFilter === 'sunday' && !isSunday) continue;

            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                const matchDay = dayName.toLowerCase().includes(q) || displayDateStr.includes(q);
                const matchEmp = existingReg && (existingReg.empCode.toLowerCase().includes(q) || existingReg.empName.toLowerCase().includes(q));
                if (!matchDay && !matchEmp) continue;
            }

            const card = document.createElement('div');

            // 1. RED CARD: SUNDAY
            if (isSunday) {
                card.className = 'compact-card card-red';
                card.innerHTML = `
                    <div class="card-top">
                        <span class="card-date-badge">${String(dayNum).padStart(2, '0')}/07</span>
                        <span class="card-day-name">${dayName}</span>
                    </div>
                    <div class="card-body-text">
                        <i class="fa-solid fa-ban"></i> Chủ Nhật - Không chọn
                    </div>
                    <div class="sunday-tag">
                        <i class="fa-solid fa-lock"></i> Khóa lịch
                    </div>
                `;
            }
            // 2. GREEN CARD: REGISTERED (NO CANCEL BUTTON FOR PUBLIC STAFF!)
            else if (existingReg) {
                card.className = 'compact-card card-green';
                card.innerHTML = `
                    <div class="card-top">
                        <span class="card-date-badge">${String(dayNum).padStart(2, '0')}/07</span>
                        <span class="card-day-name">${dayName}</span>
                    </div>
                    <div class="card-body-text">
                        <i class="fa-solid fa-user-check" style="margin-right:6px; color:#059669;"></i>
                        ${escapeHtml(existingReg.empCode)} - ${escapeHtml(existingReg.empName)}
                    </div>
                    <div class="registered-tag">
                        <i class="fa-solid fa-check"></i> Đã đăng ký
                    </div>
                `;
            }
            // 3. BLUE CARD: AVAILABLE / UNREGISTERED
            else {
                card.className = 'compact-card card-blue';
                card.innerHTML = `
                    <div class="card-top">
                        <span class="card-date-badge">${String(dayNum).padStart(2, '0')}/07</span>
                        <span class="card-day-name">${dayName}</span>
                    </div>
                    <div class="card-body-text">
                        <i class="fa-regular fa-circle" style="margin-right:6px;"></i> Ngày này chưa chọn
                    </div>
                    <button class="btn btn-primary btn-open-reg" data-date="${dateFormatted}" data-title="${dayName}, Ngày ${String(dayNum).padStart(2, '0')}/07/2026">
                        <i class="fa-solid fa-plus"></i> Đăng Ký
                    </button>
                `;
            }

            daysListEl.appendChild(card);
        }
    }

    function updateDashboardStats() {
        empTableCount.textContent = employees.length;
    }

    // ----------------------------------------------------------------------
    // 7. Event Handlers & Admin Password Auth (Cuong@032)
    // ----------------------------------------------------------------------
    function setupEventListeners() {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value;
            renderDaysGrid();
        });

        filterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                filterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                activeFilter = btn.dataset.filter;
                renderDaysGrid();
            });
        });

        // Key Icon Button Click -> Password Auth Modal
        btnAdminKey.addEventListener('click', () => {
            adminPassInput.value = '';
            passErrorMsg.style.display = 'none';
            openModal(passwordModal);
            setTimeout(() => adminPassInput.focus(), 150);
        });

        closePasswordModal.addEventListener('click', () => closeModal(passwordModal));
        btnCancelPass.addEventListener('click', () => closeModal(passwordModal));

        // Submit Admin Password Form (Cuong@032)
        passwordForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const inputPass = adminPassInput.value.trim();

            if (inputPass === ADMIN_PASSCODE) {
                closeModal(passwordModal);
                renderAdminRegsTable();
                openModal(adminModal);
                showToast('Xác thực Trưởng nhóm thành công!', 'success');
            } else {
                passErrorMsg.style.display = 'block';
                adminPassInput.focus();
                showToast('Mật khẩu không chính xác!', 'error');
            }
        });

        // Open Register Modal for Employee
        daysListEl.addEventListener('click', (e) => {
            const regBtn = e.target.closest('.btn-open-reg');
            if (regBtn) {
                const dateFormatted = regBtn.dataset.date;
                const titleStr = regBtn.dataset.title;

                if (registrations[dateFormatted]) {
                    showToast(`Ngày này đã có người đăng ký trước!`, 'error');
                    renderDaysGrid();
                    return;
                }

                modalDateTitle.textContent = titleStr;
                modalDateInput.value = dateFormatted;
                regNote.value = '';
                selectEmployee.value = '';
                openModal(registerModal);
            }
        });

        closeRegisterModal.addEventListener('click', () => closeModal(registerModal));
        btnCancelRegister.addEventListener('click', () => closeModal(registerModal));

        // Submit Employee Registration
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const dateStr = modalDateInput.value;
            const selectedEmpVal = selectEmployee.value;
            const noteVal = regNote.value.trim();

            if (!selectedEmpVal) {
                showToast('Vui lòng chọn Mã Nhân Viên - Tên Nhân Viên!', 'warning');
                return;
            }

            if (registrations[dateStr]) {
                const existing = registrations[dateStr];
                showToast(`Đã có người khác chọn trước! Ngày này đã thuộc về ${existing.empCode} - ${existing.empName}.`, 'error');
                closeModal(registerModal);
                renderDaysGrid();
                return;
            }

            const [empCode, empName] = selectedEmpVal.split('|');
            const nowStr = new Date().toLocaleString('vi-VN');

            registrations[dateStr] = {
                empCode,
                empName,
                note: noteVal,
                time: nowStr
            };

            saveData();

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
            renderDaysGrid();
            renderAdminRegsTable();
            showToast(`Đăng ký thành công cho ${empCode} - ${empName}!`, 'success');
        });

        // Admin Modal Controls
        closeAdminModal.addEventListener('click', () => closeModal(adminModal));

        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                tabBtns.forEach(b => b.classList.remove('active'));
                tabContents.forEach(c => c.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById(btn.dataset.tab).classList.add('active');
            });
        });

        // Add Employee
        btnAddEmployee.addEventListener('click', () => {
            const code = newEmpId.value.trim().toUpperCase();
            const name = newEmpName.value.trim();

            if (!code || !name) {
                showToast('Vui lòng nhập Mã NV và Tên NV!', 'warning');
                return;
            }

            if (employees.some(e => e.code === code)) {
                showToast(`Mã nhân viên ${code} đã tồn tại!`, 'error');
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

        // Delete Employee from Admin
        empTableBody.addEventListener('click', (e) => {
            const delBtn = e.target.closest('.btn-del-emp');
            if (delBtn) {
                const code = delBtn.dataset.code;
                if (confirm(`Bạn có chắc chắn xóa nhân viên ${code}?`)) {
                    employees = employees.filter(e => e.code !== code);
                    saveData();
                    renderEmployeeDropdown();
                    renderAdminEmployeeTable();
                    updateDashboardStats();
                    showToast(`Đã xóa nhân viên ${code}`, 'info');
                }
            }
        });

        // Admin Cancel Registration for any date
        adminRegsTableBody.addEventListener('click', (e) => {
            const cancelBtn = e.target.closest('.btn-admin-cancel-reg');
            if (cancelBtn) {
                const dateFormatted = cancelBtn.dataset.date;
                if (confirm(`Trưởng nhóm xác nhận HỦY lượt đăng ký ngày ${dateFormatted}?`)) {
                    delete registrations[dateFormatted];
                    saveData();
                    if (supabaseClient) {
                        supabaseClient.from('registrations').delete().eq('date_str', dateFormatted);
                    }
                    renderDaysGrid();
                    renderAdminRegsTable();
                    showToast(`Trưởng nhóm đã hủy đăng ký ngày ${dateFormatted}`, 'info');
                }
            }
        });

        // Save Time Window Config
        btnSaveTimeConfig.addEventListener('click', () => {
            appConfig.startTime = startTimeInput.value;
            appConfig.endTime = endTimeInput.value;
            appConfig.isOpenAlways = false;
            saveData();
            checkTimeAndTicker();
            showToast('Đã lưu cấu hình thời gian đăng ký!', 'success');
        });

        btnSetOpenNow.addEventListener('click', () => {
            appConfig.isOpenAlways = true;
            appConfig.startTime = '';
            appConfig.endTime = '';
            startTimeInput.value = '';
            endTimeInput.value = '';
            saveData();
            checkTimeAndTicker();
            showToast('Đã mở đăng ký tự do!', 'info');
        });

        // Clear All
        btnClearAllRegs.addEventListener('click', () => {
            if (confirm('CẢNH BÁO: Xóa tất cả lượt đăng ký nghỉ phép Tháng 7/2026?')) {
                registrations = {};
                saveData();
                if (supabaseClient) {
                    supabaseClient.from('registrations').delete().neq('date_str', '');
                }
                renderDaysGrid();
                renderAdminRegsTable();
                showToast('Đã xóa toàn bộ dữ liệu đăng ký Tháng 7/2026!', 'info');
            }
        });

        // Supabase Save
        btnSaveSupabase.addEventListener('click', () => {
            supabaseConfig.url = supabaseUrl.value.trim();
            supabaseConfig.key = supabaseKey.value.trim();
            localStorage.setItem(STORAGE_SUPABASE, JSON.stringify(supabaseConfig));
            initSupabaseIfConfigured();
            showToast('Đã lưu cấu hình Supabase!', 'success');
        });

        btnDisconnectSupabase.addEventListener('click', () => {
            supabaseConfig = { url: '', key: '' };
            localStorage.removeItem(STORAGE_SUPABASE);
            supabaseUrl.value = '';
            supabaseKey.value = '';
            supabaseClient = null;
            initSupabaseIfConfigured();
            showToast('Đã ngắt kết nối Supabase Cloud.', 'info');
        });

        btnExportExcel.addEventListener('click', exportToCSV);
    }

    // ----------------------------------------------------------------------
    // 8. Renders & Helpers
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
            empTableBody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#94a3b8;">Chưa có nhân viên nào trong danh sách.</td></tr>';
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

    function renderAdminRegsTable() {
        adminRegsTableBody.innerHTML = '';
        const regDates = Object.keys(registrations).sort();

        if (regDates.length === 0) {
            adminRegsTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#94a3b8;">Chưa có lượt đăng ký nào trong Tháng 7/2026.</td></tr>';
            return;
        }

        regDates.forEach(dateFormatted => {
            const reg = registrations[dateFormatted];
            const d = new Date(dateFormatted);
            const dayName = DAY_NAMES[d.getDay()];

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${dateFormatted.split('-').reverse().join('/')}</strong></td>
                <td>${dayName}</td>
                <td><span style="color:#047857; font-weight:700;">${escapeHtml(reg.empCode)} - ${escapeHtml(reg.empName)}</span></td>
                <td>${escapeHtml(reg.note || '-')}</td>
                <td>
                    <button class="btn btn-danger btn-sm btn-admin-cancel-reg" data-date="${dateFormatted}">
                        <i class="fa-solid fa-xmark"></i> Hủy Đăng Ký
                    </button>
                </td>
            `;
            adminRegsTableBody.appendChild(tr);
        });
    }

    function exportToCSV() {
        let csvContent = "\uFEFF";
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
            showToast('Chưa có lượt đăng ký nào để xuất Excel!', 'warning');
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

    function openModal(modalEl) { modalEl.classList.add('active'); }
    function closeModal(modalEl) { modalEl.classList.remove('active'); }

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

    document.addEventListener('DOMContentLoaded', init);
})();
