(function() {
    const statusBanner = document.getElementById('adminStatus');
    const loginSection = document.getElementById('loginSection');
    const calendarSection = document.getElementById('calendarSection');
    const settingsSection = document.getElementById('settingsSection');
    const loginForm = document.getElementById('adminLoginForm');
    const passwordInput = document.getElementById('adminPassword');
    const logoutButton = document.getElementById('adminLogoutButton');
    const addAppointmentButton = document.getElementById('adminAddAppointment');
    const appointmentModal = document.getElementById('appointmentModal');
    const appointmentForm = document.getElementById('appointmentForm');
    const appointmentIdField = document.getElementById('appointmentId');
    const appointmentSummaryField = document.getElementById('appointmentSummary');
    const appointmentStartField = document.getElementById('appointmentStart');
    const appointmentEndField = document.getElementById('appointmentEnd');
    const appointmentNameField = document.getElementById('appointmentCustomerName');
    const appointmentEmailField = document.getElementById('appointmentCustomerEmail');
    const appointmentPhoneField = document.getElementById('appointmentCustomerPhone');
    const appointmentNotesField = document.getElementById('appointmentCustomerNotes');
    const appointmentModalTitle = document.getElementById('appointmentModalTitle');
    const appointmentModalClose = document.getElementById('appointmentModalClose');
    const cancelAppointmentButton = document.getElementById('cancelAppointmentButton');
    const deleteAppointmentButton = document.getElementById('deleteAppointmentButton');
    const changePasswordForm = document.getElementById('changePasswordForm');
    const currentPasswordInput = document.getElementById('currentPassword');
    const newPasswordInput = document.getElementById('newPassword');
    const calendarElement = document.getElementById('adminCalendar');

    let calendar = null;
    let modalMode = 'create';

    function setStatus(message, type = 'info', timeout = 4000) {
        if (!statusBanner) {
            return;
        }

        statusBanner.textContent = message;
        statusBanner.className = `status-banner ${type}`;
        statusBanner.classList.add('visible');

        if (timeout) {
            setTimeout(() => {
                statusBanner.classList.remove('visible');
            }, timeout);
        }
    }

    function hideStatus() {
        if (statusBanner) {
            statusBanner.classList.remove('visible');
        }
    }

    function toggleSections(authenticated) {
        if (authenticated) {
            loginSection?.setAttribute('hidden', 'hidden');
            calendarSection?.removeAttribute('hidden');
            settingsSection?.removeAttribute('hidden');
            passwordInput.value = '';
        } else {
            calendarSection?.setAttribute('hidden', 'hidden');
            settingsSection?.setAttribute('hidden', 'hidden');
            loginSection?.removeAttribute('hidden');
            if (calendar) {
                calendar.destroy();
                calendar = null;
            }
        }
    }

    async function fetchWithJson(url, options = {}) {
        const response = await fetch(url, {
            credentials: 'include',
            headers: {
                'Accept': 'application/json',
                ...(options.headers || {})
            },
            ...options
        });

        let data = null;
        try {
            data = await response.json();
        } catch (error) {
            data = null;
        }

        return { response, data };
    }

    function toLocalInputValue(isoString) {
        if (!isoString) {
            return '';
        }
        const date = new Date(isoString);
        if (Number.isNaN(date.getTime())) {
            return '';
        }
        const pad = value => String(value).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }

    function toIsoString(localValue) {
        if (!localValue) {
            return null;
        }
        const date = new Date(localValue);
        if (Number.isNaN(date.getTime())) {
            return null;
        }
        return date.toISOString();
    }

    function resetModal() {
        appointmentForm?.reset();
        appointmentIdField.value = '';
        modalMode = 'create';
        deleteAppointmentButton.setAttribute('hidden', 'hidden');
    }

    function openModal({ mode = 'create', appointment = {}, start, end } = {}) {
        resetModal();
        modalMode = mode;
        const isEdit = mode === 'edit';

        appointmentModalTitle.textContent = isEdit ? 'Edit appointment' : 'New appointment';

        if (isEdit && appointment) {
            appointmentIdField.value = appointment.id || '';
            appointmentSummaryField.value = appointment.summary || 'Garden consultation';
            appointmentStartField.value = toLocalInputValue(appointment.start);
            appointmentEndField.value = toLocalInputValue(appointment.end);
            appointmentNameField.value = appointment.customerName || '';
            appointmentEmailField.value = appointment.customerEmail || '';
            appointmentPhoneField.value = appointment.customerPhone || '';
            appointmentNotesField.value = appointment.customerNotes || '';
            deleteAppointmentButton.removeAttribute('hidden');
        } else {
            const now = start ? new Date(start) : new Date();
            if (!start) {
                const minutes = now.getMinutes();
                now.setMinutes(minutes < 30 ? 30 : 60, 0, 0);
            }
            const defaultEnd = end ? new Date(end) : new Date(now.getTime() + 30 * 60 * 1000);
            appointmentSummaryField.value = 'Garden consultation';
            appointmentStartField.value = toLocalInputValue(now.toISOString());
            appointmentEndField.value = toLocalInputValue(defaultEnd.toISOString());
        }

        appointmentModal.classList.add('open');
        appointmentSummaryField.focus();
    }

    function closeModal() {
        appointmentModal.classList.remove('open');
        hideStatus();
        if (calendar) {
            calendar.unselect();
        }
    }

    function ensureCalendar() {
        if (calendar || !calendarElement) {
            return;
        }

        calendar = new FullCalendar.Calendar(calendarElement, {
            initialView: 'dayGridMonth',
            height: 'auto',
            selectable: true,
            editable: false,
            dayMaxEvents: true,
            headerToolbar: {
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek,listWeek'
            },
            eventTimeFormat: { hour: 'numeric', minute: '2-digit' },
            select: selectionInfo => {
                openModal({
                    mode: 'create',
                    start: selectionInfo.startStr,
                    end: selectionInfo.endStr
                });
            },
            eventClick: info => {
                info.jsEvent.preventDefault();
                if (info.event) {
                    openModal({
                        mode: 'edit',
                        appointment: {
                            id: info.event.id,
                            summary: info.event.title,
                            start: info.event.startStr,
                            end: info.event.endStr,
                            ...(info.event.extendedProps || {})
                        }
                    });
                }
            },
            events: async (fetchInfo, successCallback, failureCallback) => {
                try {
                    const params = new URLSearchParams({
                        start: fetchInfo.startStr,
                        end: fetchInfo.endStr
                    });
                    const { response, data } = await fetchWithJson(`/api/appointments?${params.toString()}`);
                    if (!response.ok) {
                        throw new Error(data && data.message ? data.message : 'Unable to load appointments.');
                    }
                    const appointments = Array.isArray(data?.appointments) ? data.appointments : [];
                    const events = appointments.map(appointment => ({
                        id: appointment.id,
                        title: appointment.summary || appointment.customerName || 'Garden consultation',
                        start: appointment.start,
                        end: appointment.end,
                        extendedProps: {
                            customerName: appointment.customerName,
                            customerEmail: appointment.customerEmail,
                            customerPhone: appointment.customerPhone,
                            customerNotes: appointment.customerNotes,
                            summary: appointment.summary,
                            description: appointment.description
                        }
                    }));
                    successCallback(events);
                } catch (error) {
                    setStatus(error.message || 'Unable to load appointments.', 'error');
                    failureCallback(error);
                }
            }
        });

        calendar.render();
    }

    async function checkAuthentication() {
        try {
            const { response, data } = await fetchWithJson('/api/admin/me');
            if (response.ok && data && data.authenticated) {
                toggleSections(true);
                ensureCalendar();
                calendar?.refetchEvents();
            } else {
                toggleSections(false);
            }
        } catch (error) {
            console.error('Unable to verify session', error);
            toggleSections(false);
        }
    }

    async function handleLogin(event) {
        event.preventDefault();
        const password = passwordInput.value.trim();
        if (!password) {
            setStatus('Please enter the admin password.', 'error');
            return;
        }

        const { response, data } = await fetchWithJson('/api/admin/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ password })
        });

        if (response.ok && data && data.authenticated) {
            setStatus('Signed in successfully.', 'success');
            toggleSections(true);
            ensureCalendar();
            calendar?.refetchEvents();
        } else {
            const message = data && data.message ? data.message : 'Incorrect password. Please try again.';
            setStatus(message, 'error');
        }
    }

    async function handleLogout() {
        await fetchWithJson('/api/admin/logout', { method: 'POST' });
        toggleSections(false);
        setStatus('Signed out successfully.', 'info');
    }

    async function saveAppointment(event) {
        event.preventDefault();
        const summary = appointmentSummaryField.value.trim();
        const startIso = toIsoString(appointmentStartField.value);
        const endIso = toIsoString(appointmentEndField.value);

        if (!summary || !startIso || !endIso) {
            setStatus('Please complete the required fields before saving.', 'error');
            return;
        }

        const payload = {
            summary,
            start: startIso,
            end: endIso,
            description: appointmentNotesField.value.trim() || '',
            customerName: appointmentNameField.value.trim(),
            customerEmail: appointmentEmailField.value.trim(),
            customerPhone: appointmentPhoneField.value.trim(),
            customerNotes: appointmentNotesField.value.trim()
        };

        const appointmentId = appointmentIdField.value;
        const isEdit = modalMode === 'edit' && appointmentId;
        const endpoint = isEdit ? `/api/appointments/${appointmentId}` : '/api/appointments';
        const method = isEdit ? 'PUT' : 'POST';

        const { response, data } = await fetchWithJson(endpoint, {
            method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            setStatus(isEdit ? 'Appointment updated.' : 'Appointment added.', 'success');
            closeModal();
            calendar?.refetchEvents();
        } else if (response.status === 409 || (data && data.error === 'SlotUnavailable')) {
            setStatus(data && data.message ? data.message : 'That slot is already taken. Try another time.', 'error');
        } else {
            const message = data && data.message ? data.message : 'Unable to save the appointment. Please try again.';
            setStatus(message, 'error');
        }
    }

    async function deleteAppointment() {
        const appointmentId = appointmentIdField.value;
        if (!appointmentId) {
            closeModal();
            return;
        }

        if (!confirm('Delete this appointment? This action cannot be undone.')) {
            return;
        }

        const { response, data } = await fetchWithJson(`/api/appointments/${appointmentId}`, {
            method: 'DELETE'
        });

        if (response.ok || response.status === 204) {
            setStatus('Appointment removed.', 'success');
            closeModal();
            calendar?.refetchEvents();
        } else {
            const message = data && data.message ? data.message : 'Unable to delete the appointment.';
            setStatus(message, 'error');
        }
    }

    async function changePassword(event) {
        event.preventDefault();
        const currentPassword = currentPasswordInput.value.trim();
        const newPassword = newPasswordInput.value.trim();

        if (!currentPassword || !newPassword) {
            setStatus('Enter both your current and new passwords.', 'error');
            return;
        }

        if (newPassword.length < 8) {
            setStatus('New password must be at least 8 characters long.', 'error');
            return;
        }

        const { response, data } = await fetchWithJson('/api/admin/password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ currentPassword, newPassword })
        });

        if (response.ok) {
            currentPasswordInput.value = '';
            newPasswordInput.value = '';
            setStatus('Password updated successfully.', 'success');
        } else {
            const message = data && data.message ? data.message : 'Unable to update password. Please try again.';
            setStatus(message, 'error');
        }
    }

    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    logoutButton?.addEventListener('click', handleLogout);
    addAppointmentButton?.addEventListener('click', () => openModal({ mode: 'create' }));
    appointmentModalClose?.addEventListener('click', closeModal);
    cancelAppointmentButton?.addEventListener('click', closeModal);
    deleteAppointmentButton?.addEventListener('click', deleteAppointment);
    appointmentForm?.addEventListener('submit', saveAppointment);
    changePasswordForm?.addEventListener('submit', changePassword);

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && appointmentModal.classList.contains('open')) {
            closeModal();
        }
    });

    checkAuthentication();
})();
