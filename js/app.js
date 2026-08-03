/* ==========================================================================
   Tool Đăng Ký Nghỉ Phép
   JavaScript Application Core (Multi-User Approval & Reason Realtime Sync)
   ========================================================================== */

(function () {
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

    function sanitizeSupabaseUrl(url) {
        if (!url) return '';
        let cleaned = url.trim();
        cleaned = cleaned.replace(/\/rest\/v1\/?$/i, '');
        cleaned = cleaned.replace(/\/+$/, '');
        return cleaned;
    }

    const ADMIN_PASSCODE = 'Cuong@032';

    const STORAGE_EMPLOYEES = 'leave_app_employees_data';
    const STORAGE_REGISTRATIONS = 'leave_app_registrations_v9';
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
        targetMonth: 7, 
        targetYear: 2026,
        startTime: '',
        endTime: '',
        isOpenAlways: true
    };

    const DEFAULT_SUPABASE = {
        url: 'https://duyttseooezluyhvwnud.supabase.co',
        key: 'sb_publishable_BYEpFH4CdWD6gZtXnZVacg_uIEX_cxK'
    };

    let employees = [];
    let registrationsList = []; // Array of { id, dateStr, empCode, empName, reason, status, adminNote, createdAt }
    let appConfig = { ...DEFAULT_CONFIG };
    let supabaseConfig = { ...DEFAULT_SUPABASE };
    let supabaseClient = null;
    let activeFilter = 'all';
    let activeApprFilter = 'all';
    let searchQuery = '';
    let timerInterval = null;
    let isInternalUpdate = false;

    const DAY_NAMES = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

    // DOM Elements
    const topStatusBanner = document.getElementById('topStatusBanner');
    const bannerIcon = document.getElementById('bannerIcon');
    const bannerText = document.getElementById('bannerText');
    const cloudStatusChip = document.getElementById('cloudStatusChip');
    const cloudStatusIcon = document.getElementById('cloudStatusIcon');
    const cloudStatusText = document.getElementById('cloudStatusText');

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
    const btnCountdownGuide = document.getElementById('btnCountdownGuide');

    // User Guide Modal
    const btnHeaderGuide = document.getElementById('btnHeaderGuide');
    const guideModal = document.getElementById('guideModal');
    const closeGuideModal = document.getElementById('closeGuideModal');
    const btnCloseGuideSubmit = document.getElementById('btnCloseGuideSubmit');

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
    const registerReason = document.getElementById('registerReason');

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

    // Admin Approval Counters
    const cntAllRegs = document.getElementById('cntAllRegs');
    const cntPendingRegs = document.getElementById('cntPendingRegs');
    const cntApprovedRegs = document.getElementById('cntApprovedRegs');
    const cntRejectedRegs = document.getElementById('cntRejectedRegs');

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

    let realtimeChannel = null;
    let isFetchingCloud = false;

    let serverTimeOffset = 0; // Difference between Supabase Cloud UTC time and Client Device local time in ms
    let isSyncingServerTime = false;

    async function syncServerTime() {
        if (isSyncingServerTime) return;
        isSyncingServerTime = true;
        try {
            const startMs = Date.now();
            const cleanUrl = sanitizeSupabaseUrl(supabaseConfig.url || DEFAULT_SUPABASE.url);
            const activeKey = supabaseConfig.key || DEFAULT_SUPABASE.key;
            
            const res = await fetch(`${cleanUrl}/rest/v1/app_config?select=id&limit=1`, {
                method: 'GET',
                headers: { 
                    'apikey': activeKey,
                    'Authorization': `Bearer ${activeKey}`
                }
            });
            const dateHead = res.headers.get('date');
            if (dateHead) {
                const serverMs = new Date(dateHead).getTime();
                const latency = (Date.now() - startMs) / 2;
                serverTimeOffset = (serverMs + latency) - Date.now();
                console.log('⏰ Cloud Server Time Synced! Offset:', serverTimeOffset, 'ms');
            }
        } catch (e) {
            console.warn('Sync server time exception:', e);
        } finally {
            isSyncingServerTime = false;
        }
    }

    function getCloudServerNow() {
        return new Date(Date.now() + serverTimeOffset);
    }

    // Initialization
    function init() {
        loadData();
        setupEventListeners();
        syncServerTime();
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
                if (event.data && event.data.type === 'DATA_UPDATED' && !isInternalUpdate) {
                    loadData();
                    updateMonthUIHeaders();
                    renderDaysGrid();
                    renderEmployeeCardsGrid();
                    renderAdminRegsTable();
                    updateDashboardStats();
                    checkTimeAndTicker();
                }
            };
        }

        window.addEventListener('focus', () => {
            if (supabaseClient) fetchSupabaseData(true);
        });

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && supabaseClient) {
                fetchSupabaseData(true);
            }
        });

        setInterval(() => {
            if (supabaseClient) fetchSupabaseData(true);
        }, 15000);
    }

    function updateCloudBadge(state, text) {
        if (!cloudStatusChip) return;
        cloudStatusChip.className = `cloud-status-chip ${state}`;
        if (state === 'online') {
            if (cloudStatusIcon) cloudStatusIcon.className = 'fa-solid fa-cloud-check';
            if (cloudStatusText) cloudStatusText.textContent = text || 'Cloud Realtime';
        } else if (state === 'syncing') {
            if (cloudStatusIcon) cloudStatusIcon.className = 'fa-solid fa-spinner fa-spin';
            if (cloudStatusText) cloudStatusText.textContent = text || 'Đang đồng bộ...';
        } else {
            if (cloudStatusIcon) cloudStatusIcon.className = 'fa-solid fa-cloud-slash';
            if (cloudStatusText) cloudStatusText.textContent = text || 'Ngoại tuyến';
        }
    }

    function loadData() {
        let savedEmp = localStorage.getItem(STORAGE_EMPLOYEES) || localStorage.getItem('leave_app_employees_v8');
        employees = savedEmp ? JSON.parse(savedEmp) : [...DEFAULT_EMPLOYEES];

        let savedRegs = localStorage.getItem(STORAGE_REGISTRATIONS) || localStorage.getItem('leave_app_registrations_data');
        if (savedRegs) {
            try {
                const parsed = JSON.parse(savedRegs);
                if (Array.isArray(parsed)) {
                    registrationsList = parsed;
                } else if (typeof parsed === 'object') {
                    // Convert old object structure to new array
                    registrationsList = [];
                    Object.keys(parsed).forEach(dateStr => {
                        const item = parsed[dateStr];
                        registrationsList.push({
                            id: `reg_${dateStr}_${item.empCode}`,
                            dateStr: dateStr,
                            empCode: item.empCode,
                            empName: item.empName,
                            reason: item.note || 'Nghỉ phép cá nhân',
                            status: 'approved',
                            adminNote: '',
                            createdAt: item.time || ''
                        });
                    });
                }
            } catch (e) {
                registrationsList = [];
            }
        } else {
            registrationsList = [];
        }

        let savedConfig = localStorage.getItem(STORAGE_CONFIG) || localStorage.getItem('leave_app_config_v8');
        appConfig = savedConfig ? JSON.parse(savedConfig) : { ...DEFAULT_CONFIG };

        if (appConfig.targetMonth === undefined || appConfig.targetMonth === null) {
            appConfig.targetMonth = 7;
        }

        let savedSupa = localStorage.getItem(STORAGE_SUPABASE);
        if (savedSupa) {
            try {
                const parsed = JSON.parse(savedSupa);
                supabaseConfig = {
                    url: sanitizeSupabaseUrl(parsed.url) || DEFAULT_SUPABASE.url,
                    key: parsed.key ? parsed.key : DEFAULT_SUPABASE.key
                };
            } catch (e) {
                supabaseConfig = { ...DEFAULT_SUPABASE };
            }
        } else {
            supabaseConfig = { ...DEFAULT_SUPABASE };
        }

        if (!supabaseConfig.url) supabaseConfig.url = DEFAULT_SUPABASE.url;
        if (!supabaseConfig.key) supabaseConfig.key = DEFAULT_SUPABASE.key;

        supabaseUrl.value = supabaseConfig.url;
        supabaseKey.value = supabaseConfig.key;

        configMonthSelect.value = String(appConfig.targetMonth ?? 7);
        configYearSelect.value = String(appConfig.targetYear ?? 2026);

        startTimeInput.value = formatForDateTimeInput(appConfig.startTime);
        endTimeInput.value = formatForDateTimeInput(appConfig.endTime);
    }

    function formatForDateTimeInput(dateStr) {
        if (!dateStr) return '';
        try {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return '';
            const pad = (n) => String(n).padStart(2, '0');
            const year = d.getFullYear();
            const month = pad(d.getMonth() + 1);
            const day = pad(d.getDate());
            const hours = pad(d.getHours());
            const minutes = pad(d.getMinutes());
            return `${year}-${month}-${day}T${hours}:${minutes}`;
        } catch (e) {
            return '';
        }
    }

    const STORAGE_STATUS_CACHE = 'leave_app_status_cache_v1';

    function saveData(broadcast = true) {
        localStorage.setItem(STORAGE_EMPLOYEES, JSON.stringify(employees));
        localStorage.setItem(STORAGE_REGISTRATIONS, JSON.stringify(registrationsList));
        localStorage.setItem(STORAGE_CONFIG, JSON.stringify(appConfig));
        localStorage.setItem(STORAGE_SUPABASE, JSON.stringify(supabaseConfig));

        const statusCache = {};
        registrationsList.forEach(r => {
            if (r.id) statusCache[r.id] = r.status;
            if (r.dateStr && r.empCode) statusCache[`${r.dateStr}_${r.empCode}`] = r.status;
        });
        localStorage.setItem(STORAGE_STATUS_CACHE, JSON.stringify(statusCache));

        if (broadcast && syncChannel) {
            isInternalUpdate = true;
            syncChannel.postMessage({ type: 'DATA_UPDATED' });
            setTimeout(() => { isInternalUpdate = false; }, 300);
        }
    }

    function updateMonthUIHeaders() {
        const m = (appConfig.targetMonth ?? 7) + 1;
        const y = appConfig.targetYear ?? 2026;
        const mStr = String(m).padStart(2, '0');

        appHeaderSub.textContent = `THÁNG ${mStr} / ${y} • ĐĂNG KÝ & DUYỆT LỊCH PHÉP`;
        gridTitleSection.innerHTML = `<i class="fa-solid fa-calendar-days"></i> Lịch Đăng Ký Tháng ${mStr}/${y}`;
    }

    function initSupabaseIfConfigured() {
        const cleanUrl = sanitizeSupabaseUrl(supabaseConfig.url || DEFAULT_SUPABASE.url);
        const activeKey = supabaseConfig.key || DEFAULT_SUPABASE.key;

        if (window.supabase && cleanUrl && activeKey) {
            try {
                supabaseConfig.url = cleanUrl;
                supabaseConfig.key = activeKey;
                supabaseUrl.value = cleanUrl;
                supabaseKey.value = activeKey;
                supabaseClient = window.supabase.createClient(cleanUrl, activeKey);
                fetchSupabaseData();
                subscribeSupabaseRealtime();
            } catch (err) {
                updateCloudBadge('offline', 'Lỗi kết nối');
                supabaseStatusAlert.innerHTML = `<div class="alert alert-warning" style="color:#e11d48; padding:10px;"><i class="fa-solid fa-triangle-exclamation"></i> Lỗi kết nối Supabase: ${err.message}</div>`;
            }
        } else {
            updateCloudBadge('offline', 'Chưa cấu hình');
            supabaseStatusAlert.innerHTML = `
                <div class="alert alert-warning" style="background:#f8fafc; border-color:#cbd5e1; color:#64748b; padding:10px; border-radius:8px;">
                    <i class="fa-solid fa-circle-info"></i> Đang tự động sử dụng Supabase Key hệ thống để kết nối Cloud Realtime.
                </div>`;
        }
    }

    function subscribeSupabaseRealtime() {
        if (!supabaseClient) return;
        try {
            if (realtimeChannel) {
                supabaseClient.removeChannel(realtimeChannel);
            }

            realtimeChannel = supabaseClient.channel('leave-app-realtime-sync')
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public' },
                    (payload) => {
                        console.log('⚡ Supabase Realtime Event Received:', payload);
                        
                        if (payload.table === 'registrations') {
                            if (payload.eventType === 'INSERT' && payload.new) {
                                const dStr = payload.new.date_str || '';
                                const parts = dStr.split('-');
                                const dateFormatted = parts.length === 3 ? `${parts[2]}/${parts[1]}` : dStr;
                                const empCode = payload.new.emp_code || '';
                                const empName = payload.new.emp_name || '';
                                const reason = payload.new.reason || '';
                                showToast(`🔔 ${empCode} - ${empName} vừa gửi đơn xin nghỉ ngày ${dateFormatted}! (Lý do: ${reason})`, 'warning');
                            } else if (payload.eventType === 'UPDATE' && payload.new) {
                                const dStr = payload.new.date_str || '';
                                const parts = dStr.split('-');
                                const dateFormatted = parts.length === 3 ? `${parts[2]}/${parts[1]}` : dStr;
                                const empName = payload.new.emp_name || '';
                                if (payload.new.status === 'approved') {
                                    showToast(`🎉 Trưởng nhóm đã DUYỆT đơn nghỉ ngày ${dateFormatted} cho ${empName}!`, 'success');
                                } else if (payload.new.status === 'rejected') {
                                    showToast(`ℹ️ Đơn nghỉ ngày ${dateFormatted} của ${empName} đã chuyển trạng thái TỪ CHỐI.`, 'info');
                                }
                            } else if (payload.eventType === 'DELETE') {
                                showToast(`ℹ️ Đã cập nhật lại lịch nghỉ phép từ Trưởng nhóm.`, 'info');
                            }
                        } else if (payload.table === 'app_config') {
                            showToast(`🔔 Cấu hình đếm ngược mở lịch vừa được cập nhật!`, 'info');
                        } else if (payload.table === 'employees') {
                            showToast(`🔔 Danh sách nhân viên vừa được cập nhật từ Cloud!`, 'info');
                        }

                        fetchSupabaseData(true);
                    }
                )
                .subscribe((status) => {
                    if (status === 'SUBSCRIBED') {
                        updateCloudBadge('online', 'Cloud Realtime');
                    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                        updateCloudBadge('offline', 'Lỗi Realtime');
                    }
                });
        } catch (err) {
            console.warn('Realtime subscription exception:', err);
        }
    }

    async function fetchSupabaseData(isSilent = false) {
        if (!supabaseClient || isFetchingCloud) return;
        isFetchingCloud = true;
        if (!isSilent) updateCloudBadge('syncing', 'Đang đồng bộ...');

        try {
            const [regRes, cfgRes, empRes] = await Promise.all([
                supabaseClient.from('registrations').select('*'),
                supabaseClient.from('app_config').select('*').limit(1),
                supabaseClient.from('employees').select('*')
            ]);

            // 1. Process Registrations List
            if (!regRes.error && regRes.data) {
                let statusCache = {};
                try {
                    const savedCache = localStorage.getItem(STORAGE_STATUS_CACHE);
                    if (savedCache) statusCache = JSON.parse(savedCache);
                } catch (e) {}

                registrationsList = regRes.data.map(item => {
                    const itemKey = `${item.date_str}_${item.emp_code}`;
                    const cachedStatus = statusCache[item.id] || statusCache[itemKey];
                    return {
                        id: item.id || `reg_${item.date_str}_${item.emp_code}`,
                        dateStr: item.date_str,
                        empCode: item.emp_code,
                        empName: item.emp_name,
                        reason: item.note || item.reason || 'Nghỉ phép cá nhân',
                        status: item.status || cachedStatus || 'pending',
                        adminNote: item.admin_note || '',
                        createdAt: item.created_at || ''
                    };
                });
            }

            // 2. Process App Config
            if (!cfgRes.error && cfgRes.data) {
                if (cfgRes.data.length > 0) {
                    const cloudCfg = cfgRes.data[0];
                    if (cloudCfg.config_json) {
                        const parsedCfg = typeof cloudCfg.config_json === 'string' ? JSON.parse(cloudCfg.config_json) : cloudCfg.config_json;
                        appConfig = { ...appConfig, ...parsedCfg };
                        configMonthSelect.value = String(appConfig.targetMonth ?? 7);
                        configYearSelect.value = String(appConfig.targetYear ?? 2026);
                        startTimeInput.value = formatForDateTimeInput(appConfig.startTime);
                        endTimeInput.value = formatForDateTimeInput(appConfig.endTime);
                    }
                } else {
                    pushConfigToSupabase();
                }
            }

            // 3. Process Employees List
            if (!empRes.error && empRes.data) {
                if (empRes.data.length > 0) {
                    employees = empRes.data.map(e => ({ code: e.code, name: e.name }));
                } else {
                    pushEmployeesToSupabase();
                }
            }

            supabaseStatusAlert.innerHTML = `
                <div class="alert alert-warning" style="background:#f0fdf4; border-color:#86efac; color:#15803d; padding:10px; border-radius:8px;">
                    <i class="fa-solid fa-cloud-check"></i> Đã kết nối Supabase Cloud Database thành công! Dữ liệu được đồng bộ Realtime.
                </div>`;

            updateCloudBadge('online', 'Cloud Realtime');
            saveData(false);
            updateMonthUIHeaders();
            renderDaysGrid();
            renderEmployeeCardsGrid();
            renderAdminEmployeeTable();
            renderAdminRegsTable();
            updateDashboardStats();
            checkTimeAndTicker();

        } catch (e) {
            console.warn('Supabase network connection failed:', e);
            updateCloudBadge('offline', 'Ngoại tuyến');
        } finally {
            isFetchingCloud = false;
        }
    }

    async function pushConfigToSupabase() {
        if (!supabaseClient) return false;
        try {
            const { error } = await supabaseClient.from('app_config').upsert({
                id: 1,
                config_json: appConfig,
                updated_at: new Date().toISOString()
            });
            if (error) {
                console.error('Push config error:', error);
                showToast(`Lỗi lưu cấu hình lên Cloud: ${error.message}`, 'error');
                return false;
            }
            return true;
        } catch (e) {
            console.warn('Push config exception:', e);
            return false;
        }
    }

    async function pushEmployeesToSupabase() {
        if (!supabaseClient) return false;
        try {
            await supabaseClient.from('employees').delete().neq('code', 'TEMP_DEL_999');
            if (employees.length > 0) {
                const { error } = await supabaseClient.from('employees').insert(
                    employees.map(e => ({ code: e.code, name: e.name }))
                );
                if (error) {
                    console.error('Push employees error:', error);
                    showToast(`Lỗi lưu danh sách NV lên Cloud: ${error.message}`, 'error');
                    return false;
                }
            }
            return true;
        } catch (e) {
            console.warn('Push employees exception:', e);
            return false;
        }
    }

    function startCountdownTicker() {
        if (timerInterval) clearInterval(timerInterval);
        checkTimeAndTicker();
        timerInterval = setInterval(checkTimeAndTicker, 1000);
    }

    let isRegistrationOpen = true;

    function checkTimeAndTicker() {
        const now = getCloudServerNow();
        const mStr = String((appConfig.targetMonth ?? 7) + 1).padStart(2, '0');
        const y = appConfig.targetYear ?? 2026;

        if (appConfig.isOpenAlways) {
            isRegistrationOpen = true;
            countdownOverlay.style.display = 'none';
            topStatusBanner.className = 'top-status-banner open';
            bannerIcon.className = 'fa-solid fa-circle-check';
            bannerText.innerHTML = `<i class="fa-solid fa-circle-check" style="color:#22c55e;"></i> MỞ ĐĂNG KÝ NGHỈ PHÉP - THÁNG ${mStr}/${y}`;
            return;
        }

        const start = appConfig.startTime ? new Date(appConfig.startTime) : null;
        const end = appConfig.endTime ? new Date(appConfig.endTime) : null;

        if (start && now < start) {
            isRegistrationOpen = false;
            countdownOverlay.style.display = 'block';
            topStatusBanner.className = 'top-status-banner closed';
            bannerIcon.className = 'fa-solid fa-hourglass-half';
            bannerText.innerHTML = `<i class="fa-solid fa-hourglass-half" style="color:#f59e0b;"></i> CHƯA ĐẾN KỲ ĐĂNG KÝ PHÉP THÁNG ${mStr}/${y}`;

            const diff = start - now;
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const secs = Math.floor((diff % (1000 * 60)) / 1000);

            cdDays.textContent = String(days).padStart(2, '0');
            cdHours.textContent = String(hours).padStart(2, '0');
            cdMins.textContent = String(mins).padStart(2, '0');
            cdSecs.textContent = String(secs).padStart(2, '0');

            cdDescText.textContent = `Tự động mở đăng ký phép vào lúc: ${formatDateTime(start)}`;
            return;
        }

        if (end && now > end) {
            isRegistrationOpen = false;
            countdownOverlay.style.display = 'block';
            topStatusBanner.className = 'top-status-banner closed';
            bannerIcon.className = 'fa-solid fa-eye';
            bannerText.innerHTML = `<i class="fa-solid fa-eye" style="color:#0284c7;"></i> CHƯA ĐẾN KỲ ĐĂNG KÝ PHÉP THÁNG ${mStr}/${y}`;

            cdDays.textContent = '00';
            cdHours.textContent = '00';
            cdMins.textContent = '00';
            cdSecs.textContent = '00';
            cdDescText.textContent = `Thời gian đăng ký phép đã kết thúc lúc: ${formatDateTime(end)}`;
            return;
        }

        isRegistrationOpen = true;
        countdownOverlay.style.display = 'none';
        topStatusBanner.className = 'top-status-banner open';
        bannerIcon.className = 'fa-solid fa-circle-check';
        bannerText.innerHTML = `<i class="fa-solid fa-circle-check" style="color:#22c55e;"></i> MỞ ĐĂNG KÝ NGHỈ PHÉP - THÁNG ${mStr}/${y}`;
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

    // Render Calendar Days Cards
    function renderDaysGrid() {
        daysListEl.innerHTML = '';

        const targetMonth = appConfig.targetMonth ?? 7;
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
            
            const dayRegs = registrationsList.filter(r => r.dateStr === dateFormatted);
            const approvedRegs = dayRegs.filter(r => r.status === 'approved');
            const pendingRegs = dayRegs.filter(r => r.status === 'pending');

            if (activeFilter === 'available' && (isSunday || approvedRegs.length > 0)) continue;
            if (activeFilter === 'registered' && approvedRegs.length === 0 && pendingRegs.length === 0) continue;
            if (activeFilter === 'sunday' && !isSunday) continue;

            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                const matchDay = dayName.toLowerCase().includes(q) || displayDateStr.includes(q);
                const matchEmp = dayRegs.some(r => r.empCode.toLowerCase().includes(q) || r.empName.toLowerCase().includes(q) || r.reason.toLowerCase().includes(q));
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
            // 2. GREEN CARD: HAS APPROVED REGISTRATION (Renders Approved Employee Name!)
            else if (approvedRegs.length > 0) {
                card.className = 'compact-card card-green';
                const firstApproved = approvedRegs[0];
                const extraApprovedText = approvedRegs.length > 1 ? ` (+${approvedRegs.length - 1})` : '';
                card.innerHTML = `
                    <div class="card-top">
                        <span class="card-date-badge">${String(dayNum).padStart(2, '0')}/${mStr}</span>
                        <span class="card-day-name">${dayName}</span>
                    </div>
                    <div class="card-body-text" title="Lý do: ${escapeHtml(firstApproved.reason)}">
                        <i class="fa-solid fa-user-check" style="margin-right:6px; color:#16a34a;"></i>
                        ${escapeHtml(firstApproved.empCode)} - ${escapeHtml(firstApproved.empName)}${extraApprovedText}
                    </div>
                `;
            }
            // 3. AMBER CARD: HAS PENDING REGISTRATIONS (Clickable for others to apply too)
            else if (pendingRegs.length > 0) {
                card.className = 'compact-card card-amber';
                card.dataset.date = dateFormatted;
                card.dataset.title = `${dayName}, Ngày ${String(dayNum).padStart(2, '0')}/${mStr}/${targetYear}`;
                card.style.cursor = 'pointer';
                card.innerHTML = `
                    <div class="card-top">
                        <span class="card-date-badge">${String(dayNum).padStart(2, '0')}/${mStr}</span>
                        <span class="card-day-name">${dayName}</span>
                    </div>
                    <div class="card-body-text">
                        <i class="fa-solid fa-clock-rotate-left" style="margin-right:6px; color:#d97706;"></i>
                        Chờ duyệt (${pendingRegs.length} đơn)
                    </div>
                `;
            }
            // 4. BLUE CARD: AVAILABLE
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

        btnHeaderGuide.addEventListener('click', () => openModal(guideModal));
        btnCountdownGuide.addEventListener('click', () => openModal(guideModal));
        closeGuideModal.addEventListener('click', () => closeModal(guideModal));
        btnCloseGuideSubmit.addEventListener('click', () => closeModal(guideModal));

        btnAdminKey.addEventListener('click', () => {
            adminPassInput.value = '';
            passErrorMsg.style.display = 'none';
            startTimeInput.value = formatForDateTimeInput(appConfig.startTime);
            endTimeInput.value = formatForDateTimeInput(appConfig.endTime);
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

        // Direct Card Click on Any Day Card (except Sunday)
        daysListEl.addEventListener('click', (e) => {
            const clickableCard = e.target.closest('.day-card:not(.card-sunday)');
            if (clickableCard) {
                const dateFormatted = clickableCard.dataset.date;
                const titleStr = clickableCard.dataset.title;

                modalDateTitle.textContent = titleStr;
                modalDateInput.value = dateFormatted;
                registerReason.value = '';

                const registerForm = document.getElementById('registerForm');
                const pendingListBanner = document.getElementById('pendingListBanner');
                const pendingItemsContainer = document.getElementById('pendingItemsContainer');

                // Read-Only vs Register Mode Toggle
                if (!isRegistrationOpen) {
                    // READ-ONLY MODE
                    const modalHeaderTitle = document.querySelector('#registerModal .modal-header h3');
                    if (modalHeaderTitle) {
                        modalHeaderTitle.innerHTML = `<i class="fa-solid fa-eye" style="color:#0284c7;"></i> Xem Chi Tiết Lịch Nghỉ Phép`;
                    }
                    if (registerForm) registerForm.style.display = 'none';

                    if (pendingListBanner && pendingItemsContainer) {
                        pendingListBanner.style.display = 'block';
                        pendingListBanner.style.background = '#f0f9ff';
                        pendingListBanner.style.borderColor = '#bae6fd';

                        const approvedList = registrationsList.filter(r => r.dateStr === dateFormatted && r.status === 'approved');
                        const pendingList = registrationsList.filter(r => r.dateStr === dateFormatted && r.status === 'pending');

                        let htmlStr = `
                            <div style="background:#ffffff; border:1px solid #bae6fd; border-radius:10px; padding:10px; margin-bottom:8px; font-size:12px; color:#0369a1; display:flex; align-items:center; gap:8px;">
                                <i class="fa-solid fa-lock" style="color:#0284c7;"></i>
                                <span>Hệ thống chưa đến kỳ đăng ký phép mới. Bạn đang ở chế độ xem lịch công khai.</span>
                            </div>
                        `;

                        if (approvedList.length > 0) {
                            htmlStr += `
                                <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px; padding:10px; margin-bottom:8px;">
                                    <div style="font-weight:800; font-size:12px; color:#15803d; margin-bottom:4px; display:flex; align-items:center; gap:6px;">
                                        <i class="fa-solid fa-user-check" style="color:#22c55e;"></i>
                                        <span>Đã Được Trưởng Nhóm Phê Duyệt:</span>
                                    </div>
                            `;
                            approvedList.forEach(a => {
                                htmlStr += `
                                    <div style="font-size:11px; color:#166534; font-weight:700; padding:4px 0;">
                                        • ${escapeHtml(a.empCode)} - ${escapeHtml(a.empName)} <span style="font-weight:normal; opacity:0.85;">(Lý do: ${escapeHtml(a.reason || 'Nghỉ phép cá nhân')})</span>
                                    </div>
                                `;
                            });
                            htmlStr += `</div>`;
                        } else {
                            htmlStr += `
                                <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:8px 10px; margin-bottom:8px; font-size:11px; color:#64748b;">
                                    <i class="fa-solid fa-circle-info"></i> Chưa có nhân viên nào được duyệt nghỉ ngày này.
                                </div>
                            `;
                        }

                        if (pendingList.length > 0) {
                            htmlStr += `
                                <div style="background:#fffbeb; border:1px solid #fde68a; border-radius:10px; padding:10px;">
                                    <div style="font-weight:800; font-size:12px; color:#b45309; margin-bottom:6px; display:flex; align-items:center; gap:6px;">
                                        <i class="fa-solid fa-clipboard-list" style="color:#d97706;"></i>
                                        <span>Đơn Đang Chờ Xét Duyệt (${pendingList.length}):</span>
                                    </div>
                            `;
                            pendingList.forEach((p, idx) => {
                                htmlStr += `
                                    <div style="background:#ffffff; border:1px solid #fef08a; padding:6px 8px; border-radius:6px; font-size:11px; margin-bottom:4px;">
                                        <div style="display:flex; justify-content:space-between; font-weight:700; color:#b45309;">
                                            <span>#${idx + 1}. ${escapeHtml(p.empCode)} - ${escapeHtml(p.empName)}</span>
                                            <span style="font-size:10px; opacity:0.85;"><i class="fa-regular fa-clock"></i> ${escapeHtml(p.createdAt || '')}</span>
                                        </div>
                                        <div style="color:#475569; font-style:italic;">"Lý do: ${escapeHtml(p.reason || 'Nghỉ phép cá nhân')}"</div>
                                    </div>
                                `;
                            });
                            htmlStr += `</div>`;
                        }

                        pendingItemsContainer.innerHTML = htmlStr;
                    }

                    openModal(registerModal);
                    return;
                }

                // REGISTER MODE (isRegistrationOpen === true)
                const modalHeaderTitle = document.querySelector('#registerModal .modal-header h3');
                if (modalHeaderTitle) {
                    modalHeaderTitle.innerHTML = `<i class="fa-solid fa-pen-to-square"></i> Đăng Ký Nghỉ Phép`;
                }
                if (registerForm) registerForm.style.display = 'block';

                if (pendingListBanner && pendingItemsContainer) {
                    pendingListBanner.style.background = '#fffbeb';
                    pendingListBanner.style.borderColor = '#fde68a';

                    const pendingForDate = registrationsList
                        .filter(r => r.dateStr === dateFormatted && r.status === 'pending')
                        .sort((a, b) => (a.createdAt || String(a.id)).localeCompare(b.createdAt || String(b.id)));

                    if (pendingForDate.length > 0) {
                        pendingListBanner.style.display = 'block';
                        pendingItemsContainer.innerHTML = '';
                        pendingForDate.forEach((p, idx) => {
                            const itemDiv = document.createElement('div');
                            itemDiv.style.cssText = 'background:#ffffff; border:1px solid #fef08a; padding:8px 10px; border-radius:8px; font-size:11px; color:#334155; display:flex; flex-direction:column; gap:2px;';
                            itemDiv.innerHTML = `
                                <div style="display:flex; justify-content:space-between; font-weight:700; color:#b45309;">
                                    <span>#${idx + 1}. ${escapeHtml(p.empCode)} - ${escapeHtml(p.empName)}</span>
                                    <span style="font-size:10px; opacity:0.85;"><i class="fa-regular fa-clock"></i> ${escapeHtml(p.createdAt || '')}</span>
                                </div>
                                <div style="color:#475569; font-style:italic;">"Lý do: ${escapeHtml(p.reason || 'Nghỉ phép cá nhân')}"</div>
                            `;
                            pendingItemsContainer.appendChild(itemDiv);
                        });
                    } else {
                        pendingListBanner.style.display = 'none';
                    }
                }

                renderEmployeeCardsGrid();
                openModal(registerModal);
            }
        });

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

        // Submit Employee Registration
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const dateStr = modalDateInput.value;
            const selectedEmpVal = selectedEmpValue.value;
            const reasonVal = registerReason.value.trim();

            if (!selectedEmpVal) {
                showToast('Vui lòng chạm chọn 1 Thẻ Nhân Viên!', 'warning');
                return;
            }

            if (!reasonVal) {
                showToast('Vui lòng nhập Lý Do xin nghỉ phép!', 'warning');
                registerReason.focus();
                return;
            }

            const [empCode, empName] = selectedEmpVal.split('|');

            // Check if this employee already applied for this date
            const existingSameEmp = registrationsList.find(r => r.dateStr === dateStr && r.empCode === empCode && r.status !== 'rejected');
            if (existingSameEmp) {
                showToast(`Nhân viên ${empCode} - ${empName} đã có đơn xin nghỉ ngày này!`, 'error');
                closeModal(registerModal);
                return;
            }

            const nowStr = getCloudServerNow().toLocaleString('vi-VN');
            const regId = 'reg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

            const newRegRecord = {
                id: regId,
                date_str: dateStr,
                emp_code: empCode,
                emp_name: empName,
                reason: reasonVal,
                note: reasonVal,
                status: 'pending',
                created_at: nowStr
            };

            if (supabaseClient) {
                updateCloudBadge('syncing', 'Đang gửi đơn...');
                try {
                    let { error } = await supabaseClient.from('registrations').insert([newRegRecord]);

                    // Fallback for old schema if columns 'id', 'reason', or 'status' don't exist on user's Supabase yet
                    if (error && (error.code === 'PGRST204' || error.code === '42703' || (error.message && (error.message.includes('column') || error.message.includes('find') || error.message.includes('400'))))) {
                        console.warn('Supabase schema mismatch detected. Retrying with fallback payload...');
                        const fallbackPayload = {
                            date_str: dateStr,
                            emp_code: empCode,
                            emp_name: empName,
                            note: reasonVal,
                            created_at: nowStr
                        };
                        const fallbackRes = await supabaseClient.from('registrations').insert([fallbackPayload]);
                        error = fallbackRes.error;
                    }

                    if (error) {
                        console.error('Supabase registration error:', error);
                        updateCloudBadge('offline', 'Lỗi Cloud');
                        if (error.code === '23505' || (error.message && error.message.includes('duplicate'))) {
                            showToast(`Rất tiếc! Ngày này đã được đăng ký từ trước.`, 'error');
                        } else {
                            showToast(`Lỗi Cloud: ${error.message}. Hãy chạy lại file SQL trên Supabase!`, 'error');
                        }
                        await fetchSupabaseData(true);
                        closeModal(registerModal);
                        return;
                    }
                } catch (err) {
                    console.error('Push error exception:', err);
                }
            }

            registrationsList.push({
                id: regId,
                dateStr: dateStr,
                empCode: empCode,
                empName: empName,
                reason: reasonVal,
                status: 'pending',
                adminNote: '',
                createdAt: nowStr
            });

            saveData();
            updateCloudBadge('online', 'Cloud Realtime');

            closeModal(registerModal);
            renderDaysGrid();
            renderAdminRegsTable();
            
            const parts = dateStr.split('-');
            const displayDateStr = parts.length === 3 ? `${parts[2]}/${parts[1]}` : dateStr;
            showToast(`Đã gửi đơn xin nghỉ phép ngày ${displayDateStr} (Đang chờ Trưởng nhóm duyệt)!`, 'success');
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

        // Admin Approval Workspace Filters (Tất cả / Chờ Duyệt / Đã Duyệt / Từ Chối)
        const apprFilterBtns = document.querySelectorAll('.appr-filter-btn');
        apprFilterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                apprFilterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                activeApprFilter = btn.dataset.apprFilter;
                renderAdminRegsTable();
            });
        });

        btnAddEmployee.addEventListener('click', async () => {
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
            await pushEmployeesToSupabase();
            renderEmployeeCardsGrid();
            renderAdminEmployeeTable();
            updateDashboardStats();
            showToast(`Đã thêm nhân viên ${code} - ${name}`, 'success');
        });

        empTableBody.addEventListener('click', async (e) => {
            const delBtn = e.target.closest('.btn-del-emp');
            if (delBtn) {
                const code = delBtn.dataset.code;
                if (confirm(`Bạn có chắc chắn xóa nhân viên ${code}?`)) {
                    employees = employees.filter(e => e.code !== code);
                    saveData();
                    await pushEmployeesToSupabase();
                    renderEmployeeCardsGrid();
                    renderAdminEmployeeTable();
                    updateDashboardStats();
                    showToast(`Đã xóa nhân viên ${code}`, 'info');
                }
            }
        });

        // Admin Approval Actions (Duyệt / Từ chối / Xóa)
        adminRegsTableBody.addEventListener('click', async (e) => {
            const approveBtn = e.target.closest('.btn-appr-approve');
            const rejectBtn = e.target.closest('.btn-appr-reject');
            const delBtn = e.target.closest('.btn-del-reg');

            if (approveBtn) {
                const regId = approveBtn.dataset.id;
                const reg = registrationsList.find(r => String(r.id) === String(regId));
                if (reg) {
                    reg.status = 'approved';
                    saveData();
                    if (supabaseClient) {
                        updateCloudBadge('syncing', 'Đang duyệt...');
                        const targetId = isNaN(Number(regId)) ? regId : Number(regId);
                        let { error } = await supabaseClient.from('registrations').update({ status: 'approved' }).eq('id', targetId);
                        if (error) {
                            console.warn('Update status by id failed, retrying with fallback query...', error);
                            await supabaseClient.from('registrations').update({ status: 'approved' }).eq('date_str', reg.dateStr).eq('emp_code', reg.empCode);
                        }
                        updateCloudBadge('online', 'Cloud Realtime');
                    }
                    renderDaysGrid();
                    renderAdminRegsTable();
                    showToast(`🎉 Trưởng nhóm đã DUYỆT đơn xin nghỉ phép cho ${reg.empCode} - ${reg.empName}!`, 'success');
                }
            } else if (rejectBtn) {
                const regId = rejectBtn.dataset.id;
                const reg = registrationsList.find(r => String(r.id) === String(regId));
                if (reg) {
                    reg.status = 'rejected';
                    saveData();
                    if (supabaseClient) {
                        updateCloudBadge('syncing', 'Đang xử lý...');
                        const targetId = isNaN(Number(regId)) ? regId : Number(regId);
                        let { error } = await supabaseClient.from('registrations').update({ status: 'rejected' }).eq('id', regId);
                        if (error) {
                            console.warn('Update status by id failed, retrying with fallback query...', error);
                            await supabaseClient.from('registrations').update({ status: 'rejected' }).eq('date_str', reg.dateStr).eq('emp_code', reg.empCode);
                        }
                        updateCloudBadge('online', 'Cloud Realtime');
                    }
                    renderDaysGrid();
                    renderAdminRegsTable();
                    showToast(`ℹ️ Trưởng nhóm đã TỪ CHỐI đơn xin nghỉ phép của ${reg.empCode} - ${reg.empName}.`, 'info');
                }
            } else if (delBtn) {
                const regId = delBtn.dataset.id;
                const reg = registrationsList.find(r => String(r.id) === String(regId));
                if (reg && confirm(`Xác nhận XÓA hoàn toàn đơn đăng ký của ${reg.empCode} - ${reg.empName}?`)) {
                    registrationsList = registrationsList.filter(r => String(r.id) !== String(regId));
                    saveData();
                    if (supabaseClient) {
                        updateCloudBadge('syncing', 'Đang xóa...');
                        const targetId = isNaN(Number(regId)) ? regId : Number(regId);
                        let { error } = await supabaseClient.from('registrations').delete().eq('id', targetId);
                        if (error) {
                            await supabaseClient.from('registrations').delete().eq('date_str', reg.dateStr).eq('emp_code', reg.empCode);
                        }
                        updateCloudBadge('online', 'Cloud Realtime');
                    }
                    renderDaysGrid();
                    renderAdminRegsTable();
                    showToast(`Đã xóa đơn đăng ký.`, 'info');
                }
            }
        });

        btnSaveTimeConfig.addEventListener('click', async () => {
            const startVal = startTimeInput.value;
            const endVal = endTimeInput.value;

            if (!startVal || !endVal) {
                showToast('Vui lòng chọn đầy đủ Thời Gian Bắt Đầu và Kết Thúc để cài đếm ngược!', 'warning');
                return;
            }

            const newConfig = {
                targetMonth: parseInt(configMonthSelect.value, 10),
                targetYear: parseInt(configYearSelect.value, 10),
                startTime: startVal,
                endTime: endVal,
                isOpenAlways: false
            };

            const oldConfig = { ...appConfig };
            appConfig = { ...appConfig, ...newConfig };

            if (supabaseClient) {
                updateCloudBadge('syncing', 'Đang lưu...');
                const ok = await pushConfigToSupabase();
                if (!ok) {
                    appConfig = oldConfig;
                    saveData();
                    updateCloudBadge('offline', 'Lỗi Cloud');
                    return;
                }
                updateCloudBadge('online', 'Cloud Realtime');
            }

            saveData();
            updateMonthUIHeaders();
            renderDaysGrid();
            checkTimeAndTicker();
            showToast(`🔒 Đã lưu cấu hình KHÓA ĐẾM NGƯỢC Tháng ${appConfig.targetMonth + 1}/${appConfig.targetYear}!`, 'success');
        });

        btnSetOpenNow.addEventListener('click', async () => {
            const oldConfig = { ...appConfig };
            appConfig.targetMonth = parseInt(configMonthSelect.value, 10);
            appConfig.targetYear = parseInt(configYearSelect.value, 10);
            appConfig.isOpenAlways = true;
            appConfig.startTime = '';
            appConfig.endTime = '';
            startTimeInput.value = '';
            endTimeInput.value = '';

            if (supabaseClient) {
                updateCloudBadge('syncing', 'Đang lưu...');
                const ok = await pushConfigToSupabase();
                if (!ok) {
                    appConfig = oldConfig;
                    saveData();
                    updateCloudBadge('offline', 'Lỗi Cloud');
                    return;
                }
                updateCloudBadge('online', 'Cloud Realtime');
            }

            saveData();
            updateMonthUIHeaders();
            renderDaysGrid();
            checkTimeAndTicker();
            showToast(`Đã mở đăng ký tự do Tháng ${appConfig.targetMonth + 1}/${appConfig.targetYear}!`, 'info');
        });

        const btnSetLockNow = document.getElementById('btnSetLockNow');
        if (btnSetLockNow) {
            btnSetLockNow.addEventListener('click', async () => {
                const now = getCloudServerNow();
                const futureStart = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
                const futureEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

                const startStr = formatForDateTimeInput(futureStart);
                const endStr = formatForDateTimeInput(futureEnd);

                startTimeInput.value = startStr;
                endTimeInput.value = endStr;

                const oldConfig = { ...appConfig };
                appConfig.targetMonth = parseInt(configMonthSelect.value, 10);
                appConfig.targetYear = parseInt(configYearSelect.value, 10);
                appConfig.isOpenAlways = false;
                appConfig.startTime = startStr;
                appConfig.endTime = endStr;

                if (supabaseClient) {
                    updateCloudBadge('syncing', 'Đang lưu...');
                    const ok = await pushConfigToSupabase();
                    if (!ok) {
                        appConfig = oldConfig;
                        saveData();
                        updateCloudBadge('offline', 'Lỗi Cloud');
                        return;
                    }
                    updateCloudBadge('online', 'Cloud Realtime');
                }

                saveData();
                updateMonthUIHeaders();
                renderDaysGrid();
                checkTimeAndTicker();
                showToast(`🔒 ĐÃ KHÓA LỊCH ĐĂNG KÝ NGAY BÂY GIỜ!`, 'success');
            });
        }

        btnClearAllRegs.addEventListener('click', async () => {
            const mStr = String((appConfig.targetMonth ?? 7) + 1).padStart(2, '0');
            if (confirm(`CẢNH BÁO: Xóa tất cả đơn đăng ký nghỉ phép Tháng ${mStr}/${appConfig.targetYear}?`)) {
                if (supabaseClient) {
                    updateCloudBadge('syncing', 'Đang xóa tất cả...');
                    const { error } = await supabaseClient.from('registrations').delete().neq('id', 'TEMP_DEL_999');
                    if (error) {
                        console.error('Clear all error:', error);
                        showToast(`Không thể xóa trên Cloud: ${error.message}`, 'error');
                        updateCloudBadge('offline', 'Lỗi Cloud');
                        await fetchSupabaseData(true);
                        return;
                    }
                    updateCloudBadge('online', 'Cloud Realtime');
                }

                registrationsList = [];
                saveData();
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
            supabaseConfig = { ...DEFAULT_SUPABASE };
            localStorage.removeItem(STORAGE_SUPABASE);
            supabaseUrl.value = DEFAULT_SUPABASE.url;
            supabaseKey.value = DEFAULT_SUPABASE.key;
            initSupabaseIfConfigured();
            showToast('Đã khôi phục Supabase Cloud mặc định hệ thống.', 'info');
        });

        btnExportExcel.addEventListener('click', exportToCSV);
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

    // Render Admin Approval Workspace Table
    function renderAdminRegsTable() {
        adminRegsTableBody.innerHTML = '';

        // Calculate Counters
        if (cntAllRegs) cntAllRegs.textContent = registrationsList.length;
        if (cntPendingRegs) cntPendingRegs.textContent = registrationsList.filter(r => r.status === 'pending').length;
        if (cntApprovedRegs) cntApprovedRegs.textContent = registrationsList.filter(r => r.status === 'approved').length;
        if (cntRejectedRegs) cntRejectedRegs.textContent = registrationsList.filter(r => r.status === 'rejected').length;

        let filtered = [...registrationsList];
        if (activeApprFilter !== 'all') {
            filtered = filtered.filter(r => r.status === activeApprFilter);
        }

        // Sort by dateStr descending, then by createdAt ASCENDING (Ai gửi trước đứng trên!)
        filtered.sort((a, b) => {
            if (a.dateStr !== b.dateStr) {
                return b.dateStr.localeCompare(a.dateStr);
            }
            return (a.createdAt || a.id).localeCompare(b.createdAt || b.id);
        });

        if (filtered.length === 0) {
            adminRegsTableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#94a3b8; padding:20px;">Không có đơn xin nghỉ phép nào phù hợp với bộ lọc.</td></tr>';
            return;
        }

        filtered.forEach(reg => {
            const parts = reg.dateStr.split('-');
            const displayDate = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : reg.dateStr;

            // Find order among applications on the same date
            const sameDateRegs = registrationsList
                .filter(r => r.dateStr === reg.dateStr)
                .sort((a, b) => (a.createdAt || a.id).localeCompare(b.createdAt || b.id));
            const orderIndex = sameDateRegs.findIndex(r => r.id === reg.id) + 1;
            const orderTag = sameDateRegs.length > 1 ? `<div style="margin-top:2px;"><span style="font-size:10px; font-weight:700; color:#0284c7; background:#e0f2fe; padding:2px 6px; border-radius:10px;">Đơn #${orderIndex} (Nộp ${orderIndex === 1 ? 'đầu tiên' : 'sau'})</span></div>` : '';
            
            let statusBadge = `<span class="badge-status badge-pending"><i class="fa-solid fa-clock"></i> Chờ duyệt</span>`;
            if (reg.status === 'approved') {
                statusBadge = `<span class="badge-status badge-approved"><i class="fa-solid fa-check"></i> Đã duyệt</span>`;
            } else if (reg.status === 'rejected') {
                statusBadge = `<span class="badge-status badge-rejected"><i class="fa-solid fa-xmark"></i> Từ chối</span>`;
            }

            let actionBtns = '';
            if (reg.status === 'pending') {
                actionBtns = `
                    <button class="btn-appr-approve" data-id="${reg.id}"><i class="fa-solid fa-check"></i> Duyệt</button>
                    <button class="btn-appr-reject" data-id="${reg.id}"><i class="fa-solid fa-xmark"></i> Từ Chối</button>
                    <button class="btn btn-danger btn-sm btn-del-reg" data-id="${reg.id}"><i class="fa-solid fa-trash"></i></button>
                `;
            } else if (reg.status === 'approved') {
                actionBtns = `
                    <button class="btn-appr-reject" data-id="${reg.id}"><i class="fa-solid fa-xmark"></i> Đổi sang Từ Chối</button>
                    <button class="btn btn-danger btn-sm btn-del-reg" data-id="${reg.id}"><i class="fa-solid fa-trash"></i></button>
                `;
            } else {
                actionBtns = `
                    <button class="btn-appr-approve" data-id="${reg.id}"><i class="fa-solid fa-check"></i> Duyệt Lại</button>
                    <button class="btn btn-danger btn-sm btn-del-reg" data-id="${reg.id}"><i class="fa-solid fa-trash"></i></button>
                `;
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${displayDate}</strong></td>
                <td><span style="color:#0284c7; font-weight:700;">${escapeHtml(reg.empCode)} - ${escapeHtml(reg.empName)}</span></td>
                <td>
                    <div style="font-size:11px; color:#475569; font-weight:600;"><i class="fa-regular fa-clock"></i> ${escapeHtml(reg.createdAt || 'N/A')}</div>
                    ${orderTag}
                </td>
                <td><div style="max-width:220px; font-size:12px; color:#334155; line-height:1.4;">${escapeHtml(reg.reason || 'Nghỉ phép cá nhân')}</div></td>
                <td>${statusBadge}</td>
                <td><div style="display:flex; gap:6px; flex-wrap:wrap;">${actionBtns}</div></td>
            `;
            adminRegsTableBody.appendChild(tr);
        });
    }

    function exportToCSV() {
        let csvContent = "\uFEFF";
        csvContent += "STT,Ngày Đăng Ký,Mã Nhân Viên,Tên Nhân Viên,Lý Do Xin Nghỉ,Trạng Thái,Thời Gian Gửi Đơn\n";

        let count = 0;
        registrationsList.forEach((reg) => {
            count++;
            const parts = reg.dateStr.split('-');
            const displayDate = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : reg.dateStr;
            let statusText = 'Chờ duyệt';
            if (reg.status === 'approved') statusText = 'Đã duyệt';
            if (reg.status === 'rejected') statusText = 'Từ chối';

            csvContent += `${count},"${displayDate}","${reg.empCode}","${reg.empName}","${reg.reason || ''}","${statusText}","${reg.createdAt || ''}"\n`;
        });

        if (count === 0) {
            showToast('Chưa có đơn xin nghỉ phép nào để xuất Excel!', 'warning');
            return;
        }

        const targetMonth = appConfig.targetMonth ?? 7;
        const targetYear = appConfig.targetYear ?? 2026;
        const mStr = String(targetMonth + 1).padStart(2, '0');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `Danh_Sach_Don_Xin_Nghi_Phep_Thang_${mStr}_${targetYear}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast(`Đã xuất file Excel gồm ${count} đơn xin nghỉ phép!`, 'success');
    }

    function openModal(modalEl) { modalEl.classList.add('active'); }
    function closeModal(modalEl) { modalEl.classList.remove('active'); }

    function showToast(message, type = 'info') {
        const toastContainer = document.getElementById('toastContainer');
        const toastEl = document.createElement('div');
        toastEl.className = `toast toast-${type}`;

        let icon = 'fa-info-circle';
        if (type === 'success') icon = 'fa-circle-check';
        if (type === 'error') icon = 'fa-circle-exclamation';
        if (type === 'warning') icon = 'fa-triangle-exclamation';

        toastEl.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${escapeHtml(message)}</span>`;
        toastContainer.appendChild(toastEl);

        setTimeout(() => {
            toastEl.style.opacity = '0';
            toastEl.style.transform = 'translateY(10px)';
            setTimeout(() => toastEl.remove(), 300);
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
