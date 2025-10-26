const express = require('express');
const path = require('path');
const fs = require('fs/promises');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const APPOINTMENTS_FILE = path.join(DATA_DIR, 'appointments.json');
const ADMIN_FILE = path.join(DATA_DIR, 'admin.json');
const DEFAULT_ADMIN_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD || 'garden-admin';

async function ensureDataFiles() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  try {
    await fs.access(APPOINTMENTS_FILE);
  } catch {
    await fs.writeFile(APPOINTMENTS_FILE, JSON.stringify({ appointments: [] }, null, 2));
  }

  try {
    await fs.access(ADMIN_FILE);
    const raw = await fs.readFile(ADMIN_FILE, 'utf8');
    const data = JSON.parse(raw || '{}');
    if (!data.passwordHash) {
      const passwordHash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);
      await fs.writeFile(
        ADMIN_FILE,
        JSON.stringify({ passwordHash, updatedAt: new Date().toISOString() }, null, 2)
      );
    }
  } catch {
    const passwordHash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);
    await fs.writeFile(
      ADMIN_FILE,
      JSON.stringify({ passwordHash, updatedAt: new Date().toISOString() }, null, 2)
    );
  }
}

async function readAppointments() {
  try {
    const raw = await fs.readFile(APPOINTMENTS_FILE, 'utf8');
    const data = JSON.parse(raw || '{}');
    if (Array.isArray(data)) {
      return data;
    }
    if (Array.isArray(data.appointments)) {
      return data.appointments;
    }
    return [];
  } catch (error) {
    console.error('Failed to read appointments file', error);
    return [];
  }
}

async function writeAppointments(appointments) {
  await fs.writeFile(
    APPOINTMENTS_FILE,
    JSON.stringify({ appointments, updatedAt: new Date().toISOString() }, null, 2)
  );
}

async function readAdmin() {
  try {
    const raw = await fs.readFile(ADMIN_FILE, 'utf8');
    return JSON.parse(raw || '{}');
  } catch (error) {
    console.error('Failed to read admin file', error);
    return {};
  }
}

async function updateAdminPassword(newPassword) {
  const passwordHash = await bcrypt.hash(newPassword, 10);
  const payload = {
    passwordHash,
    updatedAt: new Date().toISOString()
  };
  await fs.writeFile(ADMIN_FILE, JSON.stringify(payload, null, 2));
}

function requireAuth(req, res, next) {
  if (req.session && req.session.admin) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized' });
}

function sanitizeAppointmentPayload(payload) {
  const sanitized = {
    customerName: (payload.customerName || '').toString().trim(),
    customerEmail: (payload.customerEmail || '').toString().trim(),
    customerPhone: (payload.customerPhone || '').toString().trim(),
    customerNotes: (payload.customerNotes || '').toString().trim(),
    summary: (payload.summary || '').toString().trim(),
    description: (payload.description || '').toString().trim(),
    start: payload.start,
    end: payload.end
  };
  return sanitized;
}

function validateAppointmentTimes(start, end) {
  if (!start || !end) {
    return 'Appointment must include a start and end time.';
  }

  const startDate = new Date(start);
  const endDate = new Date(end);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return 'Appointment times must be valid dates.';
  }

  if (endDate <= startDate) {
    return 'Appointment end time must be after the start time.';
  }

  return null;
}

function hasConflict(appointments, start, end, excludeId) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  return appointments.some(appointment => {
    if (excludeId && appointment.id === excludeId) {
      return false;
    }
    const existingStart = new Date(appointment.start);
    const existingEnd = new Date(appointment.end);
    return existingEnd > startDate && existingStart < endDate;
  });
}

app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'pay-as-you-mow-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 12
    }
  })
);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/appointments', async (req, res) => {
  const appointments = await readAppointments();
  const { start, end } = req.query;

  if (start || end) {
    const startDate = start ? new Date(start) : null;
    const endDate = end ? new Date(end) : null;
    const filtered = appointments.filter(appointment => {
      const appointmentStart = new Date(appointment.start);
      const appointmentEnd = new Date(appointment.end);
      if (Number.isNaN(appointmentStart.getTime()) || Number.isNaN(appointmentEnd.getTime())) {
        return false;
      }
      if (startDate && appointmentEnd < startDate) {
        return false;
      }
      if (endDate && appointmentStart > endDate) {
        return false;
      }
      return true;
    });
    return res.json({ appointments: filtered });
  }

  return res.json({ appointments });
});

app.post('/api/appointments', async (req, res) => {
  const appointmentPayload = sanitizeAppointmentPayload(req.body || {});
  const validationError = validateAppointmentTimes(appointmentPayload.start, appointmentPayload.end);
  if (validationError) {
    return res.status(400).json({ error: 'ValidationError', message: validationError });
  }

  const appointments = await readAppointments();
  if (hasConflict(appointments, appointmentPayload.start, appointmentPayload.end)) {
    return res.status(409).json({ error: 'SlotUnavailable', message: 'This appointment slot is no longer available.' });
  }

  const newAppointment = {
    id: uuidv4(),
    ...appointmentPayload,
    createdAt: new Date().toISOString()
  };

  appointments.push(newAppointment);
  await writeAppointments(appointments);

  return res.status(201).json({ appointment: newAppointment });
});

app.put('/api/appointments/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const appointmentPayload = sanitizeAppointmentPayload(req.body || {});
  const validationError = validateAppointmentTimes(appointmentPayload.start, appointmentPayload.end);
  if (validationError) {
    return res.status(400).json({ error: 'ValidationError', message: validationError });
  }

  const appointments = await readAppointments();
  const index = appointments.findIndex(appointment => appointment.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'NotFound', message: 'Appointment not found.' });
  }

  if (hasConflict(appointments, appointmentPayload.start, appointmentPayload.end, id)) {
    return res.status(409).json({ error: 'SlotUnavailable', message: 'Another appointment is scheduled during that time.' });
  }

  appointments[index] = {
    ...appointments[index],
    ...appointmentPayload,
    updatedAt: new Date().toISOString()
  };

  await writeAppointments(appointments);

  return res.json({ appointment: appointments[index] });
});

app.delete('/api/appointments/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const appointments = await readAppointments();
  const nextAppointments = appointments.filter(appointment => appointment.id !== id);

  if (nextAppointments.length === appointments.length) {
    return res.status(404).json({ error: 'NotFound', message: 'Appointment not found.' });
  }

  await writeAppointments(nextAppointments);
  return res.status(204).send();
});

app.get('/api/admin/me', (req, res) => {
  if (req.session && req.session.admin) {
    return res.json({ authenticated: true });
  }
  return res.json({ authenticated: false });
});

app.post('/api/admin/login', async (req, res) => {
  const { password } = req.body || {};
  if (typeof password !== 'string' || password.trim().length === 0) {
    return res.status(400).json({ error: 'ValidationError', message: 'Password is required.' });
  }
  const adminRecord = await readAdmin();
  const isMatch = adminRecord.passwordHash
    ? await bcrypt.compare(password, adminRecord.passwordHash)
    : false;

  if (!isMatch) {
    return res.status(401).json({ error: 'InvalidCredentials', message: 'Incorrect password.' });
  }

  req.session.admin = { loggedInAt: Date.now() };
  return res.json({ authenticated: true });
});

app.post('/api/admin/logout', (req, res) => {
  if (req.session) {
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.status(204).send();
    });
  } else {
    res.status(204).send();
  }
});

app.post('/api/admin/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length < 8) {
    return res.status(400).json({
      error: 'ValidationError',
      message: 'New password must be at least 8 characters long.'
    });
  }

  const adminRecord = await readAdmin();
  const matches = adminRecord.passwordHash
    ? await bcrypt.compare(currentPassword || '', adminRecord.passwordHash)
    : false;

  if (!matches) {
    return res.status(401).json({ error: 'InvalidCredentials', message: 'Current password is incorrect.' });
  }

  await updateAdminPassword(newPassword.trim());
  return res.json({ success: true });
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next();
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

ensureDataFiles()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });
  })
  .catch(error => {
    console.error('Failed to initialise data files', error);
    process.exit(1);
  });
