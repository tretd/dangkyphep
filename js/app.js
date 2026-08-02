/* ==========================================================================
   Tool Đăng Ký Nghỉ Phép
   JavaScript Application Core (No "Hệ Thống" Word Prefix)
   ========================================================================== */

(function () {
    // ----------------------------------------------------------------------
    // Dynamic Favicon Setter Helper
    // ----------------------------------------------------------------------
    function setFaviconUrl(url) {
        let link = document.querySelector("link[rel*='icon']");
        if (!link) {
            link = document.createElement('link');
            link.rel = 'icon';
            document.head.appendChild(link);
        }
        link.type = 'image/png';
        link.href = url;
    }
    
    setFaviconUrl('https://iili.io/F66acRs.png');

    // ----------------------------------------------------------------------
    // Supabase URL Sanitizer Helper
    // ----------------------------------------------------------------------
    function sanitizeSupabaseUrl(url) {
        if (!url) return '';
        let cleaned = url.trim();
        cleaned = cleaned.replace(/\/rest\/v1\/?$/i, '');
        cleaned = cleaned.replace(/\/+$/, '');
        return cleaned;
    }

    // ----------------------------------------------------------------------
    // 1. Constants & Persistent Storage Keys
    // ----------------------------------------------------------------------
    const ADMIN_PASSCODE = 'Cuong@032';

    const STORAGE_EMPLOYEES = 'leave_app_employees_data';
    const STORAGE_REGISTRATIONS = 'leave_app_registrations_data';
    const STORAGE_CONFIG = 'leave_app_config_data';
    const STORAGE_SUPABASE = 'leave_app_supabase_data';

    const syncChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('leave_app_sync_channel') : null;

    const DEFAULT_EMPLOYEES = [
        { code: 'NV001', name: 'Nguyễn Văn An' },
        { code: 'NV002', name: 'Trần Thị Bình' },
        { code: 'NV003', name: 'Lê Hoàng Cường' },
        { code: 'NV004', name: 'Phạm Minh Đức' },
        { code: 'NV005', name: 'Hoàng Thị Em' }
    ];

    const DEFAULT_CONFIG = {
        targetMonth: 6, // 0-indexed: 6 = July
        targetYear: 2026,
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
    const topStatusBanner = document.getElementById('topStatusBanner');
    const bannerIcon = document.getElementById('bannerIcon');
    const bannerText = document.getElementById('bannerText');

    const appHeaderSub = document.getElementById('appHeaderSub');
    const gridTitleSection = document.getElementById('gridTitleSection');
    const daysListEl = document.getElementById('daysList');
    const searchInput = document.getElementById('searchInput');
    const filterBtns = document.querySelectorAll('.filter-btn');

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
    const empCardGrid = document.getElementById('empCardGrid');
    const selectedEmpValue = document.getElementById('selectedEmpValue');

    // Admin Modal
    const adminModal = document.getElementById('adminModal');
    const closeAdminModal = document.getElementById('closeAdminModal');
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    const configMonthSelect = document.getElementById('configMonthSelect');
    const configYearSelect = document.getElementById('configYearSelect');
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
        updateMonthUIHeaders();
        renderDaysGrid();
        renderEmployeeCardsGrid();
        renderAdminEmployeeTable();
        renderAdminRegsTable();
        updateDashboardStats();

        startCountdownTicker();

        if (syncChannel) {
            syncChannel.onmessage = (event) => {
                if (event.data && event.data.type === 'DATA_UPDATED') {
                    loadData();
                    updateMonthUIHeaders();
                    renderDaysGrid();
                    renderEmployeeCardsGrid();
                    renderAdminRegsTable();
                    updateDashboardStats();
                    showToast('Dữ liệu vừa được cập nhật!', 'info');
                }
            };
        }
    }

    function loadData() {
        let savedEmp = localStorage.getItem(STORAGE_EMPLOYEES) || localStorage.getItem('leave_app_employees_v8') || localStorage.getItem('leave_app_employees_v5');
        employees = savedEmp ? JSON.parse(savedEmp) : [...DEFAULT_EMPLOYEES];

        let savedRegs = localStorage.getItem(STORAGE_REGISTRATIONS) || localStorage.getItem('leave_app_registrations_v8') || localStorage.getItem('leave_app_registrations_v5');
        registrations = savedRegs ? JSON.parse(savedRegs) : {};

        let savedConfig = localStorage.getItem(STORAGE_CONFIG) || localStorage.getItem('leave_app_config_v8') || localStorage.getItem('leave_app_config_v5');
        appConfig = savedConfig ? JSON.parse(savedConfig) : { ...DEFAULT_CONFIG };

        let savedSupa = localStorage.getItem(STORAGE_SUPABASE) || localStorage.getItem('leave_app_supabase_v8') || localStorage.getItem('leave_app_supabase_v5');
        if (savedSupa) {
            supabaseConfig = JSON.parse(savedSupa);
            supabaseConfig.url = sanitizeSupabaseUrl(supabaseConfig.url);
            supabaseUrl.value = supabaseConfig.url || '';
            supabaseKey.value = supabaseConfig.key || '';
        }

        configMonthSelect.value = String(appConfig.targetMonth ?? 6);
        configYearSelect.value = String(appConfig.targetYear ?? 2026);

        startTimeInput.value = appConfig.startTime || '';
        endTimeInput.value = appConfig.endTime || '';

        saveData();
    }

    function saveData() {
        localStorage.setItem(STORAGE_EMPLOYEES, JSON.stringify(employees));
        localStorage.setItem(STORAGE_REGISTRATIONS, JSON.stringify(registrations));
        localStorage.setItem(STORAGE_CONFIG, JSON.stringify(appConfig));
        if (supabaseConfig.url || supabaseConfig.key) {
            localStorage.setItem(STORAGE_SUPABASE, JSON.stringify(supabaseConfig));
        }

        if (syncChannel) {
            syncChannel.postMessage({ type: 'DATA_UPDATED' });
        }
    }

    function updateMonthUIHeaders() {
        const m = (appConfig.targetMonth ?? 6) + 1;
        const y = appConfig.targetYear ?? 2026;
        const mStr = String(m).padStart(2, '0');

        appHeaderSub.textContent = `THÁNG ${mStr} / ${y} • TỐI ĐA 1 NGƯỜI / NGÀY`;
        gridTitleSection.innerHTML = `<i class="fa-solid fa-calendar-days"></i> Lịch Đăng Ký Tháng ${mStr}/${y}`;
    }

    // ----------------------------------------------------------------------
    // 4. Supabase Cloud Sync
    // ----------------------------------------------------------------------
    function initSupabaseIfConfigured() {
        const cleanUrl = sanitizeSupabaseUrl(supabaseConfig.url);

        if (window.supabase && cleanUrl && supabaseConfig.key) {
            try {
                supabaseConfig.url = cleanUrl;
                supabaseUrl.value = cleanUrl;
                supabaseClient = window.supabase.createClient(cleanUrl, supabaseConfig.key);
                fetchSupabaseData();
            } catch (err) {
                supabaseStatusAlert.innerHTML = `<div class="alert alert-warning" style="color:#e11d48; padding:10px;"><i class="fa-solid fa-triangle-exclamation"></i> Lỗi kết nối Supabase: ${err.message}</div>`;
            }
        } else {
            supabaseStatusAlert.innerHTML = `
                <div class="alert alert-warning" style="background:#f8fafc; border-color:#cbd5e1; color:#64748b; padding:10px; border-radius:8px;">
                    <i class="fa-solid fa-circle-info"></i> Đang chạy ở chế độ <b>Local Demo</b>. Thêm URL & Key để bật Cloud Realtime.
                </div>`;
        }
    }

    async function fetchSupabaseData() {
        if (!supabaseClient) return;
        try {
            const { data, error } = await supabaseClient.from('registrations').select('*');
            if (error) {
                supabaseStatusAlert.innerHTML = `<div class="alert alert-warning" style="color:#e11d48; background:#fff1f2; border:1px solid #fecdd3; padding:10px; border-radius:8px;"><i class="fa-solid fa-triangle-exclamation"></i> Lỗi dữ liệu Supabase: ${escapeHtml(error.message)}. Vui lòng kiểm tra lại URL (Không kèm /rest/v1/)</div>`;
                return;
            }
            if (data) {
                supabaseStatusAlert.innerHTML = `
                    <div class="alert alert-warning" style="background:#f0fdf4; border-color:#86efac; color:#15803d; padding:10px; border-radius:8px;">
                        <i class="fa-solid fa-cloud-check"></i> Đã kết nối Supabase Cloud Database thành công!
                    </div>`;

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
            supabaseStatusAlert.innerHTML = `<div class="alert alert-warning" style="color:#e11d48; padding:10px;"><i class="fa-solid fa-triangle-exclamation"></i> Lỗi kết nối Supabase: ${e.message}</div>`;
        }
    }

    // ----------------------------------------------------------------------
    // 5. Countdown Ticker & Fixed Top Status Banner (No "Hệ Thống" Prefix)
    // ----------------------------------------------------------------------
    function startCountdownTicker() {
        if (timerInterval) clearInterval(timerInterval);
        checkTimeAndTicker();
        timerInterval = setInterval(checkTimeAndTicker, 1000);
    }

    function checkTimeAndTicker() {
        const now = new Date();
        const mStr = String((appConfig.targetMonth ?? 6) + 1).padStart(2, '0');
        const y = appConfig.targetYear ?? 2026;

        if (appConfig.isOpenAlways) {
            countdownOverlay.style.display = 'none';
            topStatusBanner.className = 'top-status-banner open';
            bannerIcon.className = 'fa-solid fa-lock-open';
            bannerText.textContent = `ĐĂNG KÝ NGHỈ PHÉP - THÁNG ${mStr}/${y}`;
            return;
        }

        const start = appConfig.startTime ? new Date(appConfig.startTime) : null;
        const end = appConfig.endTime ? new Date(appConfig.endTime) : null;

        if (start && now < start) {
            countdownOverlay.style.display = 'flex';
            topStatusBanner.className = 'top-status-banner closed';
            bannerIcon.className = 'fa-solid fa-hourglass-half';
            bannerText.textContent = `LỊCH ĐĂNG KÝ ĐANG ĐẾM NGƯỢC CHỜ MỞ (THÁNG ${mStr}/${y})`;

            const diff = start - now;
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const secs = Math.floor((diff % (1000 * 60)) / 1000);

            cdDays.textContent = String(days).padStart(2, '0');
            cdHours.textContent = String(hours).padStart(2, '0');
            cdMins.textContent = String(mins).padStart(2, '0');
            cdSecs.textContent = String(secs).padStart(2, '0');

            cdDescText.textContent = `Tự động mở lịch đăng ký vào lúc: ${formatDateTime(start)}`;
            return;
        }

        if (end && now > end) {
            countdownOverlay.style.display = 'flex';
            topStatusBanner.className = 'top-status-banner closed';
            bannerIcon.className = 'fa-solid fa-lock';
            bannerText.textContent = `LỊCH ĐĂNG KÝ ĐÃ KHÓA / HẾT HẠN (THÁNG ${mStr}/${y})`;

            cdDays.textContent = '00';
            cdHours.textContent = '00';
            cdMins.textContent = '00';
            cdSecs.textContent = '00';
            cdDescText.textContent = `Thời gian đăng ký đã kết thúc lúc: ${formatDateTime(end)}`;
            return;
        }

        countdownOverlay.style.display = 'none';
        topStatusBanner.className = 'top-status-banner open';
        bannerIcon.className = 'fa-solid fa-lock-open';
        bannerText.textContent = `ĐĂNG KÝ NGHỈ PHÉP - THÁNG ${mStr}/${y}`;
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
    // 6. Render Ultra-Compact Cards Grid
    // ----------------------------------------------------------------------
    function renderDaysGrid() {
        daysListEl.innerHTML = '';

        const targetMonth = appConfig.targetMonth ?? 6;
        const targetYear = appConfig.targetYear ?? 2026;
        const totalDaysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
        const mStr = String(targetMonth + 1).padStart(2, '0');

        for (let dayNum = 1; dayNum <= totalDaysInMonth; dayNum++) {
            const dateObj = new Date(targetYear, targetMonth, dayNum);
            const dayOfWeekIndex = dateObj.getDay();
            const dayName = DAY_NAMES[dayOfWeekIndex];
            const isSunday = (dayOfWeekIndex === 0);

            const dateFormatted = `${targetYear}-${mStr}-${String(dayNum).padStart(2, '0')}`;
            const displayDateStr = `${String(dayNum).padStart(2, '0')}/${mStr}`;
            const existingReg = registrations[dateFormatted];

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
                        <span class="card-date-badge">${String(dayNum).padStart(2, '0')}/${mStr}</span>
                        <span class="card-day-name">${dayName}</span>
                    </div>
                `;
            }
            // 2. GREEN CARD: REGISTERED
            else if (existingReg) {
                card.className = 'compact-card card-green';
                card.innerHTML = `
                    <div class="card-top">
                        <span class="card-date-badge">${String(dayNum).padStart(2, '0')}/${mStr}</span>
                        <span class="card-day-name">${dayName}</span>
                    </div>
                    <div class="card-body-text">
                        <i class="fa-solid fa-user-check" style="margin-right:6px; color:#16a34a;"></i>
                        ${escapeHtml(existingReg.empCode)} - ${escapeHtml(existingReg.empName)}
                    </div>
                `;
            }
            // 3. BLUE CARD: AVAILABLE
            else {
                card.className = 'compact-card card-blue';
                card.dataset.date = dateFormatted;
                card.dataset.title = `${dayName}, Ngày ${String(dayNum).padStart(2, '0')}/${mStr}/${targetYear}`;
                card.innerHTML = `
                    <div class="card-top">
                        <span class="card-date-badge">${String(dayNum).padStart(2, '0')}/${mStr}</span>
                        <span class="card-day-name">${dayName}</span>
                    </div>
                    <div class="card-body-text">
                        <i class="fa-regular fa-circle" style="margin-right:6px;"></i> Chưa chọn
                    </div>
                `;
            }

            daysListEl.appendChild(card);
        }
    }

    // ----------------------------------------------------------------------
    // 7. Render Custom Colorful Employee Cards Grid Selector
    // ----------------------------------------------------------------------
    function renderEmployeeCardsGrid() {
        empCardGrid.innerHTML = '';
        selectedEmpValue.value = '';

        if (employees.length === 0) {
            empCardGrid.innerHTML = '<div style="color:#94a3b8; font-size:12px; grid-column:1/-1;">Chưa có nhân viên nào. Vui lòng vào Trưởng Nhóm để thêm.</div>';
            return;
        }

        employees.forEach((emp, idx) => {
            const themeClass = `emp-theme-${idx % 7}`;
            const card = document.createElement('div');
            card.className = `emp-select-card ${themeClass}`;
            card.dataset.value = `${emp.code}|${emp.name}`;

            const initials = emp.name.split(' ').pop() || emp.code;

            card.innerHTML = `
                <div class="emp-info-wrapper">
                    <div class="emp-avatar-badge">${escapeHtml(initials.substring(0, 2).toUpperCase())}</div>
                    <div>
                        <div style="font-size:11px; opacity:0.8;">${escapeHtml(emp.code)}</div>
                        <div>${escapeHtml(emp.name)}</div>
                    </div>
                </div>
                <i class="fa-solid fa-circle-check emp-check-icon"></i>
            `;

            empCardGrid.appendChild(card);
        });
    }

    function updateDashboardStats() {
        empTableCount.textContent = employees.length;
    }

    // ----------------------------------------------------------------------
    // 8. Event Handlers
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

        btnAdminKey.addEventListener('click', () => {
            adminPassInput.value = '';
            passErrorMsg.style.display = 'none';
            openModal(passwordModal);
            setTimeout(() => adminPassInput.focus(), 150);
        });

        closePasswordModal.addEventListener('click', () => closeModal(passwordModal));
        btnCancelPass.addEventListener('click', () => closeModal(passwordModal));

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

        // Direct Card Click
        daysListEl.addEventListener('click', (e) => {
            const blueCard = e.target.closest('.card-blue');
            if (blueCard) {
                const dateFormatted = blueCard.dataset.date;
                const titleStr = blueCard.dataset.title;

                if (registrations[dateFormatted]) {
                    showToast(`Ngày này đã có người đăng ký trước!`, 'error');
                    renderDaysGrid();
                    return;
                }

                modalDateTitle.textContent = titleStr;
                modalDateInput.value = dateFormatted;
                renderEmployeeCardsGrid();
                openModal(registerModal);
            }
        });

        // Employee Card Selection Click
        empCardGrid.addEventListener('click', (e) => {
            const card = e.target.closest('.emp-select-card');
            if (card) {
                document.querySelectorAll('.emp-select-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                selectedEmpValue.value = card.dataset.value;
            }
        });

        closeRegisterModal.addEventListener('click', () => closeModal(registerModal));
        btnCancelRegister.addEventListener('click', () => closeModal(registerModal));

        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const dateStr = modalDateInput.value;
            const selectedEmpVal = selectedEmpValue.value;

            if (!selectedEmpVal) {
                showToast('Vui lòng chạm chọn 1 Thẻ Nhân Viên!', 'warning');
                return;
            }

            if (registrations[dateStr]) {
                const existing = registrations[dateStr];
                showToast(`Đã có người chọn trước! Ngày này thuộc về ${existing.empCode} - ${existing.empName}.`, 'error');
                closeModal(registerModal);
                renderDaysGrid();
                return;
            }

            const [empCode, empName] = selectedEmpVal.split('|');
            const nowStr = new Date().toLocaleString('vi-VN');

            registrations[dateStr] = {
                empCode,
                empName,
                note: '',
                time: nowStr
            };

            saveData();

            if (supabaseClient) {
                try {
                    await supabaseClient.from('registrations').insert([
                        { date_str: dateStr, emp_code: empCode, emp_name: empName, note: '', created_at: nowStr }
                    ]);
                } catch (err) {
                    console.error('Supabase push error:', err);
                }
            }

            closeModal(registerModal);
            renderDaysGrid();
            renderAdminRegsTable();
            showToast(`Đã chọn thành công cho ${empCode} - ${empName}!`, 'success');
        });

        closeAdminModal.addEventListener('click', () => closeModal(adminModal));

        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                tabBtns.forEach(b => b.classList.remove('active'));
                tabContents.forEach(c => c.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById(btn.dataset.tab).classList.add('active');
            });
        });

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
            renderEmployeeCardsGrid();
            renderAdminEmployeeTable();
            updateDashboardStats();
            showToast(`Đã thêm nhân viên ${code} - ${name}`, 'success');
        });

        empTableBody.addEventListener('click', (e) => {
            const delBtn = e.target.closest('.btn-del-emp');
            if (delBtn) {
                const code = delBtn.dataset.code;
                if (confirm(`Bạn có chắc chắn xóa nhân viên ${code}?`)) {
                    employees = employees.filter(e => e.code !== code);
                    saveData();
                    renderEmployeeCardsGrid();
                    renderAdminEmployeeTable();
                    updateDashboardStats();
                    showToast(`Đã xóa nhân viên ${code}`, 'info');
                }
            }
        });

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

        btnSaveTimeConfig.addEventListener('click', () => {
            appConfig.targetMonth = parseInt(configMonthSelect.value, 10);
            appConfig.targetYear = parseInt(configYearSelect.value, 10);
            appConfig.startTime = startTimeInput.value;
            appConfig.endTime = endTimeInput.value;
            appConfig.isOpenAlways = false;

            saveData();
            updateMonthUIHeaders();
            renderDaysGrid();
            checkTimeAndTicker();
            showToast(`Đã lưu cấu hình mở lịch Tháng ${appConfig.targetMonth + 1}/${appConfig.targetYear}!`, 'success');
        });

        btnSetOpenNow.addEventListener('click', () => {
            appConfig.targetMonth = parseInt(configMonthSelect.value, 10);
            appConfig.targetYear = parseInt(configYearSelect.value, 10);
            appConfig.isOpenAlways = true;
            appConfig.startTime = '';
            appConfig.endTime = '';
            startTimeInput.value = '';
            endTimeInput.value = '';

            saveData();
            updateMonthUIHeaders();
            renderDaysGrid();
            checkTimeAndTicker();
            showToast(`Đã mở đăng ký tự do Tháng ${appConfig.targetMonth + 1}/${appConfig.targetYear}!`, 'info');
        });

        btnClearAllRegs.addEventListener('click', () => {
            const mStr = String((appConfig.targetMonth ?? 6) + 1).padStart(2, '0');
            if (confirm(`CẢNH BÁO: Xóa tất cả lượt đăng ký nghỉ phép Tháng ${mStr}/${appConfig.targetYear}?`)) {
                registrations = {};
                saveData();
                if (supabaseClient) {
                    supabaseClient.from('registrations').delete().neq('date_str', '');
                }
                renderDaysGrid();
                renderAdminRegsTable();
                showToast(`Đã xóa toàn bộ dữ liệu đăng ký Tháng ${mStr}/${appConfig.targetYear}!`, 'info');
            }
        });

        btnSaveSupabase.addEventListener('click', () => {
            const rawUrl = supabaseUrl.value;
            const keyVal = supabaseKey.value.trim();

            const cleanUrl = sanitizeSupabaseUrl(rawUrl);

            if (!cleanUrl || !keyVal) {
                showToast('Vui lòng điền đầy đủ Supabase URL và Anon Key!', 'warning');
                return;
            }

            supabaseConfig = { url: cleanUrl, key: keyVal };
            supabaseUrl.value = cleanUrl;
            saveData();
            initSupabaseIfConfigured();
            showToast('Đã lưu kết nối Supabase Cloud thành công!', 'success');
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
    // 9. Helpers
    // ----------------------------------------------------------------------
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
            adminRegsTableBody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#94a3b8;">Chưa có lượt đăng ký nào.</td></tr>';
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
                <td><span style="color:#15803d; font-weight:700;">${escapeHtml(reg.empCode)} - ${escapeHtml(reg.empName)}</span></td>
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
        csvContent += "STT,Ngày Đăng Ký,Thứ,Mã Nhân Viên,Tên Nhân Viên,Thời Gian Đăng Ký\n";

        const targetMonth = appConfig.targetMonth ?? 6;
        const targetYear = appConfig.targetYear ?? 2026;
        const totalDaysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
        const mStr = String(targetMonth + 1).padStart(2, '0');

        let count = 0;
        for (let dayNum = 1; dayNum <= totalDaysInMonth; dayNum++) {
            const dateObj = new Date(targetYear, targetMonth, dayNum);
            const dayOfWeekIndex = dateObj.getDay();
            const dayName = DAY_NAMES[dayOfWeekIndex];
            const dateFormatted = `${targetYear}-${mStr}-${String(dayNum).padStart(2, '0')}`;
            const displayDateStr = `${String(dayNum).padStart(2, '0')}/${mStr}/${targetYear}`;

            const reg = registrations[dateFormatted];

            if (reg) {
                count++;
                csvContent += `${count},"${displayDateStr}","${dayName}","${reg.empCode}","${reg.empName}","${reg.time || ''}"\n`;
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
        link.setAttribute("download", `Danh_Sach_Dang_Ky_Nghi_Phep_Thang_${mStr}_${targetYear}.csv`);
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
