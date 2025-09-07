const admin = require('../config/firebase');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const db = admin.firestore();

// POST /api/psychiatrist/login
// Body: { email, password }
// Returns a JWT specific to psychiatrists on success
const loginPsychiatrist = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  try {
    const docRef = db.collection('psychiatrists').doc(email.toLowerCase());
    const snap = await docRef.get();
    if (!snap.exists) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const data = snap.data();
    if (!data.passwordHash) {
      return res.status(500).json({ error: 'Psychiatrist account has no password set' });
    }
    const ok = await bcrypt.compare(password, data.passwordHash || '');
    if (!ok) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const secret = process.env.JWT_SECRET || 'dev_local_secret_change_me';
    const token = jwt.sign(
      {
        sub: data.email,
        role: 'psychiatrist',
        name: data.name || null,
      },
      secret,
      { expiresIn: '12h', audience: 'psychiatrist', issuer: 'mindwell-backend' }
    );

    return res.status(200).json({
      message: 'Psychiatrist login successful',
      token,
      user: {
        email: data.email,
        name: data.name || '',
        role: 'psychiatrist',
        specialization: data.specialization || null,
        college: data.college || null,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Internal error', details: err.message });
  }
};

module.exports = {
  loginPsychiatrist,
};


