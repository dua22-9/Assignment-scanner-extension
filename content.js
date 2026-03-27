

(async function () {

    console.log("Portal Scanner Extension: Loaded and waiting for subjects to appear...");
    let scanStarted = false;

    function checkAndStart() {
        if (scanStarted) return;
        const subjectHeaders = document.querySelectorAll('.card-header.bg-primary');
        if (subjectHeaders.length === 0) return;

        scanStarted = true;
        clearInterval(checkInterval);
        console.log("Portal Scanner: Found subjects, scanning for pending submissions...");
        runScanner(subjectHeaders);
    }

    const checkInterval = setInterval(checkAndStart, 1000);

    async function runScanner(subjectHeaders) {
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
        const notifyContainer = document.createElement('div');
        notifyContainer.style.position = 'fixed';
        notifyContainer.style.bottom = '20px';
        notifyContainer.style.right = '20px';
        notifyContainer.style.zIndex = '999999';
        notifyContainer.style.fontFamily = 'Galano21, Roboto, sans-serif';
        notifyContainer.style.display = 'flex';
        notifyContainer.style.flexDirection = 'column';
        notifyContainer.style.alignItems = 'flex-end';
        document.body.appendChild(notifyContainer);

        function showToast(message, isAlert = false) {
            const toast = document.createElement('div');
            toast.style.background = isAlert ? '#991B1E' : '#112B4F';
            toast.style.color = 'white';
            toast.style.padding = '15px 25px';
            toast.style.marginBottom = '10px';
            toast.style.borderRadius = '8px';
            toast.style.boxShadow = '0 10px 15px -3px rgba(0,0,0,0.3)';
            toast.style.fontSize = '14px';
            toast.style.fontWeight = 'bold';
            toast.style.transition = 'opacity 0.4s ease';
            toast.innerHTML = message;
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

                            pendingAssignments.push({ name: assignmentName, deadline: displayDeadline });

                            pendingTasksToSync.push({
                                id: `portal-assign-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                                text: `${subjectName} - ${assignmentName}`,
                                date: taskDate,
                                time: taskTime,
                                priority: 'High',
                                done: false,
                                isPortal: true,
                                category: 'Academics'
                            });
                        }
                    });

                    if (subjectHasPending) {
                        const badge = document.createElement('span');
                        badge.style.backgroundColor = '#991B1E';
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

                        header.appendChild(badge);
                        header.style.border = '2px solid #991B1E';
                        header.style.boxShadow = '0 0 10px rgba(153, 27, 30, 0.4)';

                        let toastDetails = pendingAssignments.map(p => `• ${p.name} (Due: ${p.deadline})`).join('<br/>');
                        showToast(`🚨 Pending submission for:<br/><b style="font-size: 16px;">${subjectName}</b><br/><div style="font-size: 12px; margin-top: 5px;">${toastDetails}</div>`, true);
                    }
                }

            } catch (error) {
                console.error(`Error scanning subject: ${subjectName}`, error);
            }
        });

        await Promise.all(scanPromises);

        checkingToast.remove();

        if (pendingCount === 0) {
            showToast('✅ Scanned all subjects: No pending submissions found!');
        } else {
            showToast(`⚠️ Scan Complete: Found <b style="font-size: 18px;">${pendingCount}</b> pending submission(s)!`, true);
        }
    }
})();
