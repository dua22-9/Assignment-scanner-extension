

(async function () {

    try {
        console.log("Portal Scanner Extension: System Initializing...");

    // --- [NEW] Ghost Scanner: Auto-Recovery & Background Monitoring ---
    const AUTO_SCAN_INTERVAL = 2 * 60 * 1000; // 2 Minutes
    const N8N_BASE_URL = 'http://localhost:5678'; // Change this to your Ngrok URL (e.g. https://xyz.ngrok.io) for global access

    // Universal Storage Helper (Syncs between chrome.storage and localStorage for redundancy)
    async function getStorage(key, defaultValue = null) {
        return new Promise((resolve) => {
            if (typeof chrome !== 'undefined' && chrome.storage) {
                chrome.storage.local.get([key], (result) => {
                    resolve(result[key] !== undefined ? result[key] : (localStorage.getItem(key) || defaultValue));
                });
            } else {
                resolve(localStorage.getItem(key) || defaultValue);
            }
        });
    }

    async function setStorage(key, value) {
        localStorage.setItem(key, value);
        if (typeof chrome !== 'undefined' && chrome.storage) {
            await chrome.storage.local.set({ [key]: value });
        }
    }

    async function initAutoRecovery() {
        const loginUrl = window.location.href.toLowerCase();
        const user = await getStorage('portal_auto_user');

        // 1. Handle Portal Login Page & Credentials Injection
        if (loginUrl.includes('login') || loginUrl.includes('auth')) {
            const passBase64 = await getStorage('portal_auto_pass');

            // Find Microsoft Login Button
            const msBtn = Array.from(document.querySelectorAll('button, a, div'))
                .find(el => el.textContent.toLowerCase().includes('microsoft') || el.id?.toLowerCase().includes('microsoft'));

            if (msBtn) {
                console.log("Ghost Scanner: Microsoft login button found. Redirecting...");
                setTimeout(() => msBtn.click(), 2000);
            } else if (user && passBase64) {
                // If standard login form exists, try to fill it
                const passInput = document.querySelector('input[type="password"]');
                if (passInput) {
                    const form = passInput.closest('form');
                    const userInput = form?.querySelector('input[type="text"], input[type="email"]');
                    if (userInput && !userInput.value) {
                        console.log("Ghost Scanner: Standard login form detected. Injecting credentials...");
                        userInput.value = user;
                        passInput.value = atob(passBase64);
                        setTimeout(() => form.submit(), 1000);
                    }
                }
            }
        }

        // 2. Handle Microsoft Login Specific Screens (Picker, Password, Stay Signed In)
        if (loginUrl.includes('login.microsoftonline.com')) {
            // A. Account Picker: Select the specific user account if possible
            const accounts = Array.from(document.querySelectorAll('div[role="button"][data-test-id], .table-row, [data-test-id]'));
            let targetAccount = null;

            if (user) {
                targetAccount = accounts.find(el =>
                    el.textContent.toLowerCase().includes(user.toLowerCase()) ||
                    el.getAttribute('data-test-id')?.toLowerCase().includes(user.toLowerCase())
                );
            }

            // If specific account not found, pick the first available tile
            if (!targetAccount) targetAccount = document.querySelector('div[role="button"][data-test-id], #otherTile');

            if (targetAccount) {
                console.log("Ghost Scanner: Microsoft account tile detected. Selecting...");
                setTimeout(() => targetAccount.click(), 1500);
            }

            // B. Microsoft Password Field (if not autofilled)
            const msPass = document.querySelector('input[name="passwd"], input[type="password"]');
            if (msPass && !msPass.value) {
                const passBase64 = await getStorage('portal_auto_pass');
                if (passBase64) {
                    console.log("Ghost Scanner: Microsoft password field detected. Injecting...");
                    msPass.value = atob(passBase64);
                    const submitBtn = document.querySelector('input[type="submit"], #idSIButton9');
                    if (submitBtn) setTimeout(() => submitBtn.click(), 1000);
                }
            }

            // C. "Stay signed in?" screen
            const stayBtn = document.querySelector('input[type="submit"][id="idSIButton9"], #idSIButton9');
            if (stayBtn && (document.body.textContent.includes('Stay signed in?') || document.body.textContent.includes('Keep me signed in'))) {
                console.log("Ghost Scanner: Confirming 'Stay signed in' prompt...");
                setTimeout(() => stayBtn.click(), 1000);
            }
        }
    }

    // Initialize Auto-Recovery
    initAutoRecovery();

    // 3. Background Monitoring & Session Keep-Alive
    setInterval(async () => {
        const currentUrl = window.location.href;
        if (currentUrl.includes('dashboard') || currentUrl.includes('assignment')) {
            console.log("Ghost Scanner: Keeping session alive...");
            // Dummy fetch to keep session cookie active
            fetch(currentUrl).catch(() => { });

            // Periodically refresh to catch new assignments even if laptop was idle
            const lastScan = parseInt(await getStorage('portal_last_scan_time', '0'));
            if (Date.now() - lastScan > AUTO_SCAN_INTERVAL) {
                window.location.reload();
            }
        }
    }, 60 * 1000); // Check every minute
    // --- End Ghost Scanner Logic ---

    // Update: A dismiss button added to improve user experience
    // Clear dismissal flag if we detect a login page (contains password input)
    // Clear dismissal flag if we detect a login page (contains password input)
    const passInput = document.querySelector('input[type="password"]');
    if (passInput) {
        sessionStorage.removeItem('portal_scanner_dismissed');

        // Save student portal login credentials in cookies & chrome.storage for n8n auto-login
        const form = passInput.closest('form');
        if (form) {
            form.addEventListener('submit', () => {
                const textInputs = Array.from(form.querySelectorAll('input[type="text"], input[type="email"]'));
                const userInput = textInputs.find(input => !input.hidden && input.value);
                if (userInput && passInput.value) {
                    const encodedPass = btoa(passInput.value);

                    // 1. Save to Local Storage & Chrome Storage
                    setStorage('portal_auto_user', userInput.value);
                    setStorage('portal_auto_pass', encodedPass);

                    // 2. Save to Cookies (Expires in 30 days)
                    const d = new Date();
                    d.setTime(d.getTime() + (30 * 24 * 60 * 60 * 1000));
                    let expires = "expires=" + d.toUTCString();
                    document.cookie = "portal_auto_user=" + userInput.value + ";" + expires + ";path=/";
                    document.cookie = "portal_auto_pass=" + encodedPass + ";" + expires + ";path=/";

                }
            });
        }
    }

    const defaultAlarmTone = "https://actions.google.com/sounds/v1/alarms/digital_watch_alarm_long.ogg";

    async function getFocusStreak() {
        return parseInt(await getStorage('portal_focus_streak_minutes', '0'));
    }

    async function addFocusStreak(mins) {
        let current = await getFocusStreak();
        await setStorage('portal_focus_streak_minutes', (current + mins).toString());
        return current + mins;
    }

    async function createPomodoroUI(minutes, assignmentName) {
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100vw';
        overlay.style.height = '100vh';
        overlay.style.backgroundColor = 'rgba(17, 43, 79, 0.95)'; // Portal Dark Blue
        overlay.style.zIndex = '9999999';
        overlay.style.display = 'flex';
        overlay.style.flexDirection = 'column';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.fontFamily = 'Galano21, Roboto, sans-serif';
        overlay.style.color = '#fff';
        overlay.style.backdropFilter = 'blur(10px)';

        const header = document.createElement('h2');
        header.innerHTML = `Focusing on: <span style="color: #991B1E;">${assignmentName}</span>`; // Portal Red highlight
        header.style.marginBottom = '40px';
        header.style.fontSize = '24px';
        header.style.textAlign = 'center';

        const svgSize = 220;
        const strokeWidth = 8;
        const radius = (svgSize - strokeWidth) / 2;
        const circumference = 2 * Math.PI * radius;

        const circleWrapper = document.createElement('div');
        circleWrapper.style.position = 'relative';
        circleWrapper.style.display = 'flex';
        circleWrapper.style.alignItems = 'center';
        circleWrapper.style.justifyContent = 'center';
        circleWrapper.style.width = svgSize + 'px';
        circleWrapper.style.height = svgSize + 'px';

        const progressSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        progressSvg.setAttribute('width', svgSize);
        progressSvg.setAttribute('height', svgSize);
        progressSvg.style.position = 'absolute';
        progressSvg.style.transform = 'rotate(-90deg)';
        progressSvg.style.pointerEvents = 'none';

        const circlePath = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circlePath.setAttribute('cx', svgSize / 2);
        circlePath.setAttribute('cy', svgSize / 2);
        circlePath.setAttribute('r', radius);
        circlePath.setAttribute('fill', 'none');
        circlePath.setAttribute('stroke', '#0284C7'); // Progress circle color
        circlePath.setAttribute('stroke-width', strokeWidth);
        circlePath.setAttribute('stroke-dasharray', circumference);
        circlePath.setAttribute('stroke-dashoffset', circumference);
        circlePath.setAttribute('stroke-linecap', 'round');
        circlePath.style.transition = 'stroke-dashoffset 1s linear, stroke 0.5s';
        progressSvg.appendChild(circlePath);

        const iconContainer = document.createElement('div');
        iconContainer.style.width = '200px';
        iconContainer.style.height = '200px';
        iconContainer.style.borderRadius = '50%';
        iconContainer.style.background = 'radial-gradient(circle at center, #1E3A8A, #0F172A)';
        iconContainer.style.display = 'flex';
        iconContainer.style.alignItems = 'center';
        iconContainer.style.justifyContent = 'center';
        iconContainer.style.fontSize = '80px';
        iconContainer.style.boxShadow = 'inset 0 0 20px rgba(0,0,0,0.5), 0 10px 30px rgba(0,0,0,0.5)';
        iconContainer.style.color = 'white';
        iconContainer.innerHTML = '⏳'; // Dynamic Focus Icon

        circleWrapper.appendChild(iconContainer);
        circleWrapper.appendChild(progressSvg);

        const timerDisplay = document.createElement('div');
        timerDisplay.style.fontSize = '80px';
        timerDisplay.style.fontWeight = 'bold';
        timerDisplay.style.marginTop = '40px';
        timerDisplay.innerHTML = `${minutes.toString().padStart(2, '0')}:00`;

        const btnContainer = document.createElement('div');
        btnContainer.style.marginTop = '40px';
        btnContainer.style.display = 'flex';
        btnContainer.style.gap = '20px';

        const cancelBtn = document.createElement('button');
        cancelBtn.innerHTML = '✕ Give Up';
        cancelBtn.style.padding = '12px 24px';
        cancelBtn.style.borderRadius = '30px';
        cancelBtn.style.border = '2px solid #991B1E';
        cancelBtn.style.backgroundColor = 'transparent';
        cancelBtn.style.color = '#fff';
        cancelBtn.style.cursor = 'pointer';
        cancelBtn.style.fontSize = '16px';
        cancelBtn.style.fontWeight = 'bold';

        const streakText = document.createElement('div');
        streakText.style.position = 'absolute';
        streakText.style.bottom = '30px';
        streakText.style.fontSize = '14px';
        streakText.style.opacity = '0.8';
        streakText.innerHTML = `🔥 Total Focus Streak: ${await getFocusStreak()} minutes`;

        overlay.appendChild(header);
        overlay.appendChild(circleWrapper);
        overlay.appendChild(timerDisplay);
        btnContainer.appendChild(cancelBtn);
        overlay.appendChild(btnContainer);
        overlay.appendChild(streakText);

        document.body.appendChild(overlay);

        let timeLeft = minutes * 60;
        let originalTime = timeLeft;
        let interval = setInterval(async () => {
            timeLeft--;
            if (timeLeft <= 0) {
                clearInterval(interval);
                timerDisplay.innerHTML = "00:00";
                const newStreak = await addFocusStreak(minutes);
                streakText.innerHTML = `🔥 Total Focus Streak: ${newStreak} minutes`;
                try {
                    const audio = new Audio(defaultAlarmTone);
                    audio.play();
                } catch (e) { }

                iconContainer.innerHTML = '🏆'; // Success
                circlePath.style.stroke = '#22C55E';
                circlePath.setAttribute('stroke-dashoffset', 0);
                header.innerHTML = "Session Complete! Great Job!";
                cancelBtn.innerHTML = 'Close';
                cancelBtn.style.backgroundColor = '#22C55E';
                cancelBtn.style.borderColor = '#22C55E';
            } else {
                let progress = 1 - (timeLeft / originalTime);
                circlePath.setAttribute('stroke-dashoffset', circumference - (progress * circumference));

                if (progress >= 0.5 && iconContainer.innerHTML === '⏳') {
                    iconContainer.innerHTML = '🚀';
                }
                if (progress >= 0.8 && iconContainer.innerHTML === '🚀') {
                    iconContainer.innerHTML = '🌟';
                }

                let m = Math.floor(timeLeft / 60);
                let s = timeLeft % 60;
                timerDisplay.innerHTML = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
            }
        }, 1000);

        cancelBtn.onclick = () => {
            clearInterval(interval);
            overlay.remove();
            if (timeLeft > 0) {
                alert("You gave up! Keep trying next time.");
            }
        };
    }

    let scanStarted = false;

    function checkAndStart() {
        if (scanStarted) return;
        const subjectHeaders = document.querySelectorAll('.card-header.bg-primary');
        if (subjectHeaders.length === 0) {
            if (Math.random() > 0.9) console.log("Portal Scanner: Waiting for portal subjects to load...");
            return;
        }

        scanStarted = true;
        clearInterval(checkInterval);
        console.log("Portal Scanner: Subjects found! Initializing Scanner UI...");
        runScanner(subjectHeaders);
    }

    const checkInterval = setInterval(checkAndStart, 1000);

    async function runScanner(subjectHeaders) {
        console.log("Portal Scanner: Building UI and starting background scan sequence...");

        // --- Cross-Device Sync: Fetch settings from DB if missing locally ---
        const localSender = await getStorage('wa_sender_number');
        const localReceiver = await getStorage('wa_receiver_number');
        const portalUserForSync = await getStorage('portal_auto_user');

        if ((!localSender || !localReceiver) && portalUserForSync) {
            console.log("Portal Scanner: Settings missing locally. Attempting to sync from Database for user:", portalUserForSync);
            try {
                const syncRes = await fetch(`${N8N_BASE_URL}/webhook/portal-scanner`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: 'get_settings',
                        portalUsername: portalUserForSync
                    })
                });
                if (syncRes.ok) {
                    const dbSettings = await syncRes.json();
                    if (dbSettings.senderNumber && dbSettings.receiverNumber) {
                        await setStorage('wa_sender_number', dbSettings.senderNumber);
                        await setStorage('wa_receiver_number', dbSettings.receiverNumber);
                        console.log("Portal Scanner: Settings successfully restored from Database.");
                        // Reload to apply UI changes
                        window.location.reload();
                    }
                }
            } catch (e) {
                console.error("Portal Scanner: Database sync failed", e);
            }
        }
        // Update: A dismiss button added to improve user experience
        if (sessionStorage.getItem('portal_scanner_dismissed') === 'true') {
            console.log("Portal Scanner: Dismissed for this session. Skipping scan.");
            return;
        }

        let pendingTasksToSync = [];
        let pendingCount = 0;

        const userHeadingContents = document.querySelectorAll('.user_heading_content');
        userHeadingContents.forEach(heading => {
            const strongTag = heading.querySelector('strong');
            if (strongTag && strongTag.textContent.includes('Today Classes:')) {
                const classDivs = heading.querySelectorAll('div');
                classDivs.forEach(div => {
                    const spans = div.querySelectorAll('span');
                    if (spans.length >= 2) {
                        const subjectName = spans[0].textContent.replace(':', '').replace(/\s+/g, ' ').trim();
                        const timeString = spans[1].textContent.replace(/\s+/g, ' ').trim();

                        const timeMatch = timeString.match(/(\d{1,2}:\d{2})/);
                        const startTime = timeMatch ? timeMatch[1] : '09:00';

                        pendingTasksToSync.push({
                            id: `portal-class-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                            text: `${subjectName} (Class)`,
                            date: new Date().toISOString().split('T')[0],
                            time: startTime,
                            priority: 'Medium',
                            done: false,
                            isPortal: true,
                            category: 'Academics'
                        });
                    }
                });
            }
        });
        const mainWrapper = document.createElement('div');
        mainWrapper.style.position = 'fixed';
        mainWrapper.style.bottom = '15px';
        mainWrapper.style.right = '0px';
        mainWrapper.style.paddingRight = '10px';
        mainWrapper.style.zIndex = '999999';
        mainWrapper.style.display = 'flex';
        mainWrapper.style.alignItems = 'flex-end';
        mainWrapper.style.transition = 'opacity 0.4s ease';

        const toggleBtn = document.createElement('button');
        toggleBtn.innerHTML = '▶';
        toggleBtn.style.backgroundColor = '#991B1E';
        toggleBtn.style.color = 'white';
        toggleBtn.style.border = 'none';
        toggleBtn.style.padding = '14px 8px';
        toggleBtn.style.cursor = 'pointer';
        toggleBtn.style.borderRadius = '8px 0 0 8px';
        toggleBtn.style.marginRight = '0px';
        toggleBtn.style.marginBottom = '20px';
        toggleBtn.style.fontWeight = 'bold';
        toggleBtn.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.2)';
        toggleBtn.style.display = 'flex';
        toggleBtn.style.alignItems = 'center';

        const notifyContainer = document.createElement('div');
        notifyContainer.style.fontFamily = 'Galano21, Roboto, sans-serif';
        notifyContainer.style.display = 'flex';
        notifyContainer.style.flexDirection = 'column';
        notifyContainer.style.alignItems = 'stretch';
        notifyContainer.style.maxHeight = 'calc(100vh - 120px)'; // Strict constraint to avoid overlapping top navbar
        notifyContainer.style.overflowY = 'auto';
        notifyContainer.style.scrollbarWidth = 'none'; // Hide scrollbar for a seamless look
        notifyContainer.style.width = '360px';
        notifyContainer.style.boxSizing = 'border-box';

        // Adjust the portal's body to not be covered by the notifications
        document.body.style.transition = 'padding-right 0.3s ease';
        document.body.style.paddingRight = '380px';

        let isCollapsed = false;
        toggleBtn.onclick = () => {
            isCollapsed = !isCollapsed;
            if (isCollapsed) {
                notifyContainer.style.display = 'none';
                toggleBtn.innerHTML = '◀';
                document.body.style.paddingRight = '0px';
            } else {
                notifyContainer.style.display = 'flex';
                toggleBtn.innerHTML = '▶';
                document.body.style.paddingRight = '380px';
            }
        };

        mainWrapper.appendChild(toggleBtn);
        mainWrapper.appendChild(notifyContainer);
        document.body.appendChild(mainWrapper);

        // Styling scrollbar via injected stylesheet for webkit browsers
        const styleSheet = document.createElement("style");
        styleSheet.innerText = `
            #portal-scanner-notify-container::-webkit-scrollbar {
                display: none;
            }
        `;
        document.head.appendChild(styleSheet);
        notifyContainer.id = 'portal-scanner-notify-container';

        // Update: Dismiss button commented out and replaced by WhatsApp settings
        /*
        const dismissBtn = document.createElement('div');
        dismissBtn.innerHTML = '✕ Dismiss All Notifications';
        dismissBtn.style.background = 'rgba(17, 43, 79, 0.9)';
        dismissBtn.style.backdropFilter = 'blur(4px)';
        dismissBtn.style.color = 'white';
        dismissBtn.style.padding = '8px 12px';
        dismissBtn.style.borderRadius = '20px';
        dismissBtn.style.cursor = 'pointer';
        dismissBtn.style.fontSize = '12px';
        dismissBtn.style.marginTop = '8px';
        dismissBtn.style.marginBottom = '4px';
        dismissBtn.style.order = '999';
        dismissBtn.style.fontWeight = '600';
        dismissBtn.style.textAlign = 'center';
        dismissBtn.style.transition = 'all 0.3s ease';
        dismissBtn.style.border = '1px solid rgba(255, 255, 255, 0.2)';
        dismissBtn.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.2)';

        dismissBtn.onmouseover = () => {
            dismissBtn.style.background = '#991B1E';
            dismissBtn.style.transform = 'scale(1.05)';
        };
        dismissBtn.onmouseout = () => {
            dismissBtn.style.background = 'rgba(17, 43, 79, 0.9)';
            dismissBtn.style.transform = 'scale(1)';
        };

        dismissBtn.onclick = () => {
            sessionStorage.setItem('portal_scanner_dismissed', 'true');
            mainWrapper.style.opacity = '0';
            document.body.style.paddingRight = '0px'; // Reset portal layout
            setTimeout(() => mainWrapper.remove(), 400);

            // Remove all badges and highlights added by the extension
            document.querySelectorAll('.portal-scanner-badge').forEach(b => b.remove());
            document.querySelectorAll('.portal-scanner-highlight').forEach(h => {
                h.style.border = '';
                h.style.boxShadow = '';
                h.classList.remove('portal-scanner-highlight');
            });
            console.log("Portal Scanner: Notifications dismissed and scan halted.");
        };

        notifyContainer.appendChild(dismissBtn);
        */

        // --- Settings Page for WhatsApp Notifications ---
        const settingsPanel = document.createElement('div');
        settingsPanel.style.background = 'rgba(17, 43, 79, 0.9)'; // Slightly transparent
        settingsPanel.style.color = 'white';
        settingsPanel.style.padding = '6px';
        settingsPanel.style.borderRadius = '8px';
        settingsPanel.style.marginTop = '4px';
        settingsPanel.style.marginBottom = '2px';
        settingsPanel.style.order = '999';
        settingsPanel.style.border = '1px solid rgba(255, 255, 255, 0.1)';
        settingsPanel.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
        settingsPanel.style.fontSize = '12px';


        // --- View Logic: Toggle between 'Profile' and 'Edit' modes ---
        const inputWrapper = document.createElement('div');
        const profileView = document.createElement('div');
        profileView.style.display = 'flex';
        profileView.style.gap = '4px';
        profileView.style.alignItems = 'center';
        profileView.style.display = 'none';

        const createInput = (placeholder, id) => {
            const input = document.createElement('input');
            input.type = 'text';
            input.id = id;
            input.placeholder = placeholder;
            input.style.width = '100%';
            input.style.padding = '6px';
            input.style.marginBottom = '4px';
            input.style.borderRadius = '4px';
            input.style.border = '1px solid rgba(255,255,255,0.4)';
            input.style.backgroundColor = 'white';
            input.style.color = 'black';
            input.style.boxSizing = 'border-box';
            input.style.fontSize = '12px';
            return input;
        };

        const senderInput = createInput('Sender (Instance ID)', 'wa-sender');
        const receiverInput = createInput('Receiver (+92XXXXXXXXXX)', 'wa-receiver');
        inputWrapper.appendChild(senderInput);
        inputWrapper.appendChild(receiverInput);

        const validationMsg = document.createElement('div');
        validationMsg.style.color = '#ff6b6b';
        validationMsg.style.fontSize = '10px';
        validationMsg.style.marginBottom = '8px';
        validationMsg.style.minHeight = '12px';
        validationMsg.style.textAlign = 'center';
        inputWrapper.appendChild(validationMsg);

        const saveBtn = document.createElement('button');
        saveBtn.innerHTML = 'Save & Secure';
        saveBtn.style.width = '100%';
        saveBtn.style.padding = '6px';
        saveBtn.style.backgroundColor = '#0284C7';
        saveBtn.style.color = 'white';
        saveBtn.style.border = 'none';
        saveBtn.style.borderRadius = '4px';
        saveBtn.style.cursor = 'pointer';
        saveBtn.style.fontWeight = 'bold';
        inputWrapper.appendChild(saveBtn);

        const editBtn = document.createElement('button');
        editBtn.innerHTML = '⚙️';
        editBtn.style.width = '40px';
        editBtn.style.padding = '4px 8px';
        editBtn.style.backgroundColor = 'rgba(255,255,255,0.1)';
        editBtn.style.color = 'white';
        editBtn.style.border = '1px solid rgba(255,255,255,0.2)';
        editBtn.style.borderRadius = '6px';
        editBtn.style.cursor = 'pointer';
        editBtn.style.fontSize = '14px';
        editBtn.title = 'Edit Connection Settings';
        editBtn.onclick = () => {
            profileView.style.display = 'none';
            inputWrapper.style.display = 'block';
        };

        const resendAllBtn = document.createElement('button');
        resendAllBtn.innerHTML = '📲 Resend Whole List';
        resendAllBtn.style.flex = '1';
        resendAllBtn.style.padding = '4px 8px';
        resendAllBtn.style.backgroundColor = '#0284C7';
        resendAllBtn.style.color = 'white';
        resendAllBtn.style.border = 'none';
        resendAllBtn.style.borderRadius = '6px';
        resendAllBtn.style.cursor = 'pointer';
        resendAllBtn.style.fontSize = '11px';
        resendAllBtn.style.fontWeight = 'bold';
        resendAllBtn.onclick = async () => {
            if (confirm("This will clear the history and send WhatsApp alerts for all assignments again. Continue?")) {
                await setStorage('wa_notified_assignments', '[]');
                await setStorage('wa_clear_status_sent', 'false');
                window.location.reload();
            }
        };

        const updateUIState = async () => {
            const s = await getStorage('wa_sender_number');
            const r = await getStorage('wa_receiver_number');
            if (s && r) {
                senderInput.value = s;
                receiverInput.value = r;
                profileView.innerHTML = '';
                
                // Tight layout for the single row
                profileView.style.display = 'flex';
                profileView.style.flexDirection = 'row';
                profileView.style.alignItems = 'stretch';
                profileView.style.gap = '5px';
                profileView.style.marginTop = '2px';

                profileView.appendChild(resendAllBtn);
                profileView.appendChild(editBtn);
                
                profileView.style.display = 'flex';
                inputWrapper.style.display = 'none';
            } else {
                profileView.style.display = 'none';
                inputWrapper.style.display = 'block';
            }
        };

        const validatePhone = (num) => {
            if (!num.startsWith('+92')) return 'Must start with +92';
            if (num.length !== 13) return 'Must be exactly 13 characters';
            return true;
        };

        saveBtn.onclick = async () => {
            const sVal = senderInput.value.trim();
            const rVal = receiverInput.value.trim();
            const rValid = validatePhone(rVal);

            if (!sVal || rValid !== true) {
                validationMsg.style.color = '#ff6b6b';
                validationMsg.innerHTML = !sVal ? 'Sender ID required' : `Receiver: ${rValid}`;
                return;
            }

            await setStorage('wa_sender_number', sVal);
            await setStorage('wa_receiver_number', rVal);

            const portalUser = await getStorage('portal_auto_user', '');
            const portalPassBase64 = await getStorage('portal_auto_pass', '');
            const encryptPassword = (str, key) => {
                let res = '';
                for (let i = 0; i < str.length; i++) res += String.fromCharCode(str.charCodeAt(i) ^ key.charCodeAt(i % key.length));
                return btoa(res);
            };

            let securePass = '';
            if (portalPassBase64) {
                try { securePass = encryptPassword(atob(portalPassBase64), 'FYP_SECURE_KEY_2026'); } catch (e) { }
            }

            validationMsg.style.color = '#0284C7';
            validationMsg.innerHTML = 'Syncing...';

            fetch(`${N8N_BASE_URL}/webhook/portal-scanner`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'database_setup',
                    senderNumber: sVal,
                    receiverNumber: rVal,
                    portalUsername: portalUser,
                    portalPasswordSecure: securePass
                })
            }).then(res => {
                if (res.ok) {
                    updateUIState();
                } else {
                    validationMsg.innerHTML = 'Saved locally, Sync failed.';
                }
            }).catch(() => {
                validationMsg.innerHTML = 'Saved locally, Sync failed.';
            });
        };

        settingsPanel.appendChild(profileView);
        settingsPanel.appendChild(inputWrapper);
        updateUIState();


        notifyContainer.appendChild(settingsPanel);

        function showToast(message, isAlert = false, customColor = null) {
            const toast = document.createElement('div');
            toast.style.background = customColor || (isAlert ? '#991B1E' : '#112B4F');
            toast.style.color = 'white';
            toast.style.padding = '10px 15px';
            toast.style.margin = '0';
            toast.style.marginBottom = '8px';
            toast.style.borderRadius = '8px';
            toast.style.boxShadow = '0 5px 15px -3px rgba(0,0,0,0.2)';
            toast.style.fontSize = '13px';
            toast.style.fontWeight = 'bold';
            toast.style.boxSizing = 'border-box';
            toast.style.transition = 'opacity 0.4s ease';

            if (typeof message === 'string') {
                toast.innerHTML = message;
            } else {
                toast.appendChild(message);
            }

            notifyContainer.appendChild(toast);

            if (!isAlert) {
                setTimeout(() => {
                    toast.style.opacity = '0';
                    setTimeout(() => toast.remove(), 400);
                }, 4000);
            }
            return toast;
        }

        const checkingToast = showToast(`Background Scan: Checking ${subjectHeaders.length} subjects for pending uploads... ⏳`);

        const scanPromises = Array.from(subjectHeaders).map(async (header) => {
            const subjectName = header.textContent.trim();

            let linkElement = header.closest('a');
            if (!linkElement) {
                const parentCard = header.closest('.card') || header.parentElement;
                if (parentCard) linkElement = parentCard.querySelector('a');
            }

            if (!linkElement || !linkElement.href) return;

            try {
                const response = await fetch(linkElement.href);
                const htmlText = await response.text();

                const parser = new DOMParser();
                const doc = parser.parseFromString(htmlText, 'text/html');

                const submissionLink = Array.from(doc.querySelectorAll('a')).find(a => {
                    const href = a.getAttribute('href') || '';
                    return a.textContent.trim().toLowerCase() === 'submission' || href.includes('/submission/');
                });

                if (submissionLink) {
                    let submissionUrl = submissionLink.getAttribute('href');
                    if (submissionUrl.startsWith('/')) {
                        submissionUrl = window.location.origin + submissionUrl;
                    }

                    const subResponse = await fetch(submissionUrl);
                    const subHtml = await subResponse.text();
                    const subDoc = parser.parseFromString(subHtml, 'text/html');

                    const rows = subDoc.querySelectorAll('tbody tr');
                    let subjectHasPending = false;
                    let pendingAssignments = [];

                    rows.forEach(row => {
                        const actionColumn = row.querySelector('.upload_submission');
                        if (actionColumn && actionColumn.textContent.trim().toLowerCase() === 'upload') {
                            let uploadLinkUrl = submissionUrl;
                            if (actionColumn.tagName === 'A') {
                                uploadLinkUrl = actionColumn.getAttribute('href') || submissionUrl;
                            } else {
                                const aTag = row.querySelector('a[href*="submission"], a[href*="upload"]');
                                if (aTag) uploadLinkUrl = aTag.getAttribute('href') || submissionUrl;
                            }
                            if (uploadLinkUrl.startsWith('/')) {
                                uploadLinkUrl = window.location.origin + uploadLinkUrl;
                            }

                            subjectHasPending = true;
                            pendingCount++;

                            const assignmentName = row.querySelector('.rec_submission_title')?.textContent.trim() ||
                                row.querySelectorAll('td')[1]?.textContent.trim() ||
                                'Assignment';

                            let dueDateStr = row.querySelector('.rec_submission_due_date')?.textContent.trim() || '';

                            if (!dueDateStr) {

                                const tds = Array.from(row.querySelectorAll('td'));
                                const dateTd = tds.find(td => /\d{2,4}[-/]\d{1,2}[-/]\d{1,2}/.test(td.textContent) || /\d{1,2}:\d{2}/.test(td.textContent));
                                if (dateTd) {
                                    dueDateStr = dateTd.textContent.trim();
                                }
                            }

                            let taskDate = new Date().toISOString().split('T')[0];
                            let taskTime = '23:59';
                            let displayDeadline = 'No deadline specified';

                            if (dueDateStr) {
                                displayDeadline = dueDateStr;

                                const parts = dueDateStr.replace(/\s+/g, ' ').trim().split(' ');
                                if (parts.length >= 1) taskDate = parts[0];
                                if (parts.length >= 2) {

                                    const timeParts = parts[1].split(':');
                                    if (timeParts.length >= 2) {
                                        taskTime = `${timeParts[0]}:${timeParts[1]}`;
                                    }
                                }
                            }

                            pendingAssignments.push({ name: assignmentName, deadline: displayDeadline, date: taskDate, time: taskTime, uploadUrl: uploadLinkUrl });

                            pendingTasksToSync.push({
                                id: `portal-assign-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                                text: `${subjectName} - ${assignmentName}`,
                                date: taskDate,
                                time: taskTime,
                                priority: 'High',
                                done: false,
                                isPortal: true,
                                category: 'Academics',
                                uploadUrl: uploadLinkUrl
                            });
                        }
                    });

                    if (subjectHasPending) {
                        // Color coding the notification based on urgency (darker layout matching portal shades)
                        let maxUrgencyColor = '#112B4F'; // Default Portal Navy (> 4 days)
                        let minHoursDiff = Infinity;
                        pendingAssignments.forEach(p => {
                            let deadlineDate = new Date(`${p.date}T${p.time || '23:59'}`);
                            if (!isNaN(deadlineDate)) {
                                let hoursDiff = (deadlineDate - new Date()) / (1000 * 60 * 60);
                                if (hoursDiff < minHoursDiff) minHoursDiff = hoursDiff;
                            }
                        });
                        if (minHoursDiff <= 24) {
                            maxUrgencyColor = '#991B1E'; // Portal Red for < 24 hrs
                        } else if (minHoursDiff <= 96) {
                            maxUrgencyColor = '#0284C7'; // Deep Sky Blue for 2-4 days
                        }

                        // Use a brighter blue for the portal badge if the toast is dark navy, so it contrasts with the portal header
                        const badgeColor = maxUrgencyColor === '#112B4F' ? '#0284C7' : maxUrgencyColor;

                        const badge = document.createElement('span');
                        badge.style.backgroundColor = badgeColor;
                        badge.style.color = 'white';
                        badge.style.padding = '4px 10px';
                        badge.style.borderRadius = '20px';
                        badge.style.fontSize = '12px';
                        badge.style.fontWeight = 'bold';
                        badge.style.marginLeft = '10px';
                        badge.style.display = 'inline-block';

                        if (pendingAssignments.length === 1) {
                            badge.innerHTML = `🚨 Pending Upload`;
                        } else {
                            badge.innerHTML = `🚨 ${pendingAssignments.length} Pending Uploads`;
                        }

                        badge.className = 'portal-scanner-badge'; // Added class for dismissal
                        header.appendChild(badge);
                        header.style.border = `2px solid ${badgeColor}`;
                        header.style.boxShadow = `0 0 10px ${badgeColor}`;
                        header.classList.add('portal-scanner-highlight'); // Added class for dismissal

                        const toastContent = document.createElement('div');
                        toastContent.innerHTML = `🚨 Pending submission for:<br/><b style="font-size: 15px;">${subjectName}</b><br/>`;

                        const btnStyle = "background: rgba(255,255,255,0.2); border: none; color: white; padding: 4px 6px; margin: 4px 4px 0 0; border-radius: 4px; cursor: pointer; font-size: 10px; font-weight: bold;";

                        pendingAssignments.forEach(p => {
                            const pContainer = document.createElement('div');
                            pContainer.style.marginTop = '8px';
                            pContainer.style.fontSize = '11px';
                            pContainer.innerHTML = `• <b>${p.name.substring(0, 45)}${p.name.length > 45 ? '...' : ''}</b> (Due: ${p.deadline})<br/>`;

                            const focusBtn = document.createElement('button');
                            focusBtn.innerHTML = '⏱️ Focus Timer';
                            focusBtn.style.cssText = btnStyle;
                            focusBtn.onclick = () => {
                                const mins = prompt("How many minutes do you want to focus? (e.g. 25)", "25");
                                if (mins && !isNaN(mins)) {
                                    createPomodoroUI(parseInt(mins), p.name);
                                }
                            };
                            pContainer.appendChild(focusBtn);

                            /*
                            // Alarm code kept securely commented out as requested
                            const alarmBtn = document.createElement('button');
                            alarmBtn.innerHTML = '⏰ Set Alarm';
                            alarmBtn.style.cssText = btnStyle;
                            alarmBtn.onclick = () => {
                                const modal = document.createElement('div');
                                modal.style.position = 'fixed';
                                modal.style.top = '50%';
                                modal.style.left = '50%';
                                modal.style.transform = 'translate(-50%, -50%)';
                                modal.style.backgroundColor = '#112B4F';
                                modal.style.padding = '20px';
                                modal.style.borderRadius = '12px';
                                modal.style.border = '2px solid #0284C7';
                                modal.style.zIndex = '10000000';
                                modal.style.color = 'white';
                                modal.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
                                modal.style.fontFamily = 'Galano21, Roboto, sans-serif';
                                modal.innerHTML = `
                                    <h3 style="margin-top:0; font-size: 16px;">Set Alarm for: <br/><span style="color:#38BDF8;">${p.name.substring(0, 25)}</span></h3>
                                    <label style="font-size: 12px;">Minutes from now:</label><br/>
                                    <input type="number" id="alarm-mins" value="60" style="margin-bottom:10px; width:100%; padding: 4px; box-sizing: border-box; border-radius: 4px; border: none;"><br/>
                                    <label style="font-size: 12px;">Audio Source:</label><br/>
                                    <select id="alarm-audio-sel" style="margin-bottom:10px; width:100%; padding: 4px; border-radius: 4px; border: none;">
                                        <option value="default">Default Chime</option>
                                        <option value="url">Web Audio URL</option>
                                        <option value="file">Local Audio File</option>
                                    </select><br/>
                                    <div id="alarm-extra-in"></div>
                                    <div style="display:flex; justify-content: flex-end; gap:10px; margin-top: 15px;">
                                        <button id="alarm-cancel-btn" style="background:transparent; border:1px solid #0284C7; color:white; padding:6px 12px; border-radius:5px; cursor:pointer;">Cancel</button>
                                        <button id="alarm-save-btn" style="background:#0284C7; border:none; color:white; padding:6px 12px; border-radius:5px; cursor:pointer; font-weight: bold;">Start</button>
                                    </div>
                                `;
                                document.body.appendChild(modal);

                                let sel = modal.querySelector('#alarm-audio-sel');
                                let extra = modal.querySelector('#alarm-extra-in');
                                let fileObjUrl = '';

                                sel.onchange = () => {
                                    extra.innerHTML = '';
                                    if (sel.value === 'url') {
                                        extra.innerHTML = '<input type="text" id="alarm-url" placeholder="https://domain.com/audio.mp3" style="width:100%; padding: 4px; box-sizing: border-box; border-radius: 4px; border: none;">';
                                    } else if (sel.value === 'file') {
                                        let fIn = document.createElement('input');
                                        fIn.type = 'file';
                                        fIn.accept = 'audio/*';
                                        fIn.style.width = '100%';
                                        fIn.style.fontSize = '12px';
                                        fIn.onchange = (e) => {
                                            if (e.target.files[0]) fileObjUrl = URL.createObjectURL(e.target.files[0]);
                                        };
                                        extra.appendChild(fIn);
                                    }
                                };

                                modal.querySelector('#alarm-cancel-btn').onclick = () => modal.remove();
                                modal.querySelector('#alarm-save-btn').onclick = () => {
                                    let mins = parseInt(modal.querySelector('#alarm-mins').value);
                                    if (isNaN(mins)) return;
                                    let finalUrl = defaultAlarmTone;
                                    if (sel.value === 'url') {
                                        let u = modal.querySelector('#alarm-url');
                                        if (u && u.value.trim()) finalUrl = u.value.trim();
                                    } else if (sel.value === 'file' && fileObjUrl) {
                                        finalUrl = fileObjUrl;
                                    }

                                    setTimeout(() => {
                                        try {
                                            const audio = new Audio(finalUrl);
                                            audio.play();
                                        } catch (e) {
                                            console.error("Failed to play audio alarm", e);
                                        }
                                        alert(\`⏰ ALARM: Time to work on \${p.name}!\`);
                                    }, mins * 60000);

                                    alarmBtn.innerHTML = \`⏰ Alarm in \${mins}m\`;
                                    modal.remove();
                                };
                            };
                            pContainer.appendChild(alarmBtn);
                            */

                            const submitBtn = document.createElement('button');
                            submitBtn.innerHTML = '📤 Go to Upload';
                            submitBtn.style.cssText = btnStyle;
                            submitBtn.onclick = () => {
                                if (p.uploadUrl) {
                                    window.open(p.uploadUrl, '_blank');
                                } else {
                                    alert("Submission URL could not be found for this assignment.");
                                }
                            };
                            pContainer.appendChild(submitBtn);

                            const calBtn = document.createElement('button');
                            calBtn.innerHTML = '📅 Add to Calendar';
                            calBtn.style.cssText = btnStyle;
                            calBtn.onclick = () => {
                                const title = encodeURIComponent(`Assignment: ${p.name}`);
                                const details = encodeURIComponent(`Subject: ${subjectName}\nDue: ${p.deadline}`);
                                let datesObj = '';
                                if (p.date && p.time) {
                                    try {
                                        let d = new Date(`${p.date}T${p.time}`);
                                        if (!isNaN(d)) {
                                            let iso = d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
                                            datesObj = `&dates=${iso}/${iso}`;
                                        }
                                    } catch (e) { }
                                }
                                window.open(`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}${datesObj}`, '_blank');
                            };
                            pContainer.appendChild(calBtn);

                            toastContent.appendChild(pContainer);
                        });

                        showToast(toastContent, true, maxUrgencyColor);
                    }
                }

            } catch (error) {
                console.error(`Error scanning subject: ${subjectName}`, error);
            }
        });

        await Promise.all(scanPromises);
        await setStorage('portal_last_scan_time', Date.now().toString());

        checkingToast.remove();

        const sender = await getStorage('wa_sender_number', '7107611905');
        const receiver = await getStorage('wa_receiver_number');

        if (pendingCount === 0) {
            showToast('✅ Scanned all subjects: No pending submissions found!');

            // Send clear status to n8n ONLY ONCE to prevent spam
            const clearSent = await getStorage('wa_clear_status_sent');
            if (receiver && clearSent !== 'true') {
                const payload = {
                    type: 'status_clear',
                    senderNumber: sender,
                    receiverNumber: receiver,
                    message: 'No assignments pending!'
                };
                const n8nWebhookUrl = `${N8N_BASE_URL}/webhook/portal-scanner`;
                const notifController = new AbortController();
                const notifTimeout = setTimeout(() => notifController.abort(), 3000);

                fetch(n8nWebhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    signal: notifController.signal
                }).then(() => {
                    setStorage('wa_clear_status_sent', 'true');
                }).catch(() => { });
            }
        } else {
            showToast(`⚠️ Scan Complete: Found <b style="font-size: 18px;">${pendingCount}</b> pending submission(s)!`, true);

            if (receiver) {
                // Reset clear status since assignments were found
                await setStorage('wa_clear_status_sent', 'false');

                let notifiedAssignments = JSON.parse(await getStorage('wa_notified_assignments', '[]'));
                let newAssignmentsFound = [];

                pendingTasksToSync.forEach(task => {
                    if (task.priority === 'High') { // High priority denotes pending assignments
                        let assignmentId = `${task.text}_${task.date}_${task.time}`;
                        if (!notifiedAssignments.includes(assignmentId)) {
                            newAssignmentsFound.push(task);
                            notifiedAssignments.push(assignmentId);
                        }
                    }
                });

                if (newAssignmentsFound.length > 0) {
                    // Prevent duplicate notifications by marking them as notified
                    await setStorage('wa_notified_assignments', JSON.stringify(notifiedAssignments));

                    // Send data to n8n Webhook Node
                    const n8nWebhookUrl = `${N8N_BASE_URL}/webhook/portal-scanner`;

                    newAssignmentsFound.forEach(task => {
                        const subj = task.text.split(' - ')[0] || 'Unknown Subject';
                        const assign = task.text.split(' - ').slice(1).join(' - ') || task.text;

                        // Pre-calculate Google Calendar Link
                        const title = encodeURIComponent(`Assignment: ${assign}`);
                        const details = encodeURIComponent(`Subject: ${subj}\nDue: ${task.date} ${task.time}`);
                        let datesObj = '';
                        if (task.date && task.time) {
                            try {
                                let d = new Date(`${task.date}T${task.time}`);
                                if (!isNaN(d)) {
                                    let iso = d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
                                    datesObj = `&dates=${iso}/${iso}`;
                                }
                            } catch (e) { }
                        }
                        const gCalLink = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}${datesObj}`;

                        const payload = {
                            type: 'notification',
                            senderNumber: sender,
                            receiverNumber: receiver,
                            assignmentName: assign,
                            subject: subj,
                            dueDate: `${task.date} ${task.time}`,
                            totalPending: pendingCount,
                            calendarLink: gCalLink,
                            uploadLink: task.uploadUrl || 'https://horizon.ucp.edu.pk/dashboard'
                        };

                        const notifController = new AbortController();
                        const notifTimeout = setTimeout(() => notifController.abort(), 3000);

                        fetch(n8nWebhookUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload),
                            signal: notifController.signal
                        }).then(res => {
                            clearTimeout(notifTimeout);
                            console.log('Portal Scanner: WhatsApp notification payload sent to n8n', res);
                        }).catch(err => {
                            clearTimeout(notifTimeout);
                            console.error('Portal Scanner: Failed to send to n8n webhook', err);
                        });
                    });
                }
            }
        }
    }
    } catch (e) {
        console.error("Portal Scanner Extension: CRITICAL CRASH DURING INIT", e);
    }
})();
