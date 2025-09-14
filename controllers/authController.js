
const admin = require('../config/firebase');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const db = admin.firestore();

// Backend receives Firebase ID token issued after frontend sign-up
const signup = async (req, res) => {
  const { token } = req.body;

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const userRecord = await admin.auth().getUser(decoded.uid);

    if (!userRecord.emailVerified) {
      return res.status(403).json({ error: 'Email not verified' });
    }

    // Store user in Firestore with default role as 'student'
    const userRef = db.collection('users').doc(userRecord.email);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      await userRef.set({
        email: userRecord.email,
        name: userRecord.displayName || '',
        uid: userRecord.uid,
        picture: userRecord.photoURL || '',
        role: 'student', // Default role
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    res.status(200).json({
      message: 'Signup successful',
      user: {
        email: userRecord.email,
        name: userRecord.displayName || '',
        uid: userRecord.uid,
        picture: userRecord.photoURL || '',
        role: 'student'
      },
    });
  } catch (err) {
    res.status(401).json({ error: 'Invalid token', details: err.message });
  }
};

// Backend receives Firebase ID token after frontend login
const signin = async (req, res) => {
  const { token } = req.body;

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const userRecord = await admin.auth().getUser(decoded.uid);

    if (!userRecord.emailVerified) {
      return res.status(403).json({ error: 'Email not verified' });
    }

    // Get user role from Firestore
    const userRef = db.collection('users').doc(userRecord.email);
    const userDoc = await userRef.get();
    
    let userRole = 'student'; // Default role
    if (userDoc.exists) {
      userRole = userDoc.data().role || 'student';
    }

    res.status(200).json({
      message: 'Signin successful',
      user: {
        email: userRecord.email,
        name: userRecord.displayName || '',
        uid: userRecord.uid,
        picture: userRecord.photoURL || '',
        role: userRole
      },
    });
  } catch (err) {
    res.status(401).json({ error: 'Invalid token', details: err.message });
  }
};

// New function for psychiatrist login using email/password
const loginPsychiatrist = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  try {
    const docRef = db.collection('users').doc(email.toLowerCase());
    const snap = await docRef.get();
    if (!snap.exists) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const data = snap.data();
    
    // Check if user has psychiatrist role
    if (data.role !== 'psychiatrist') {
      return res.status(401).json({ error: 'Access denied. Psychiatrist role required.' });
    }

    if (!data.passwordHash) {
      return res.status(500).json({ error: 'Account has no password set' });
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


// New function for admin login using email/password
const loginAdmin = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  try {
    const docRef = db.collection('users').doc(email.toLowerCase());
    const snap = await docRef.get();
    if (!snap.exists) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const data = snap.data();
    
    // Check if user has admin role
    if (data.role !== 'admin') {
      return res.status(401).json({ error: 'Access denied. Admin role required.' });
    }

    if (!data.passwordHash) {
      return res.status(500).json({ error: 'Account has no password set' });
    }
    
    const ok = await bcrypt.compare(password, data.passwordHash || '');
    if (!ok) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const secret = process.env.JWT_SECRET || 'dev_local_secret_change_me';
    const token = jwt.sign(
      {
        sub: data.email,
        role: 'admin',
        name: data.name || null,
      },
      secret,
      { expiresIn: '12h', audience: 'admin', issuer: 'mindwell-backend' }
    );

    return res.status(200).json({
      message: 'Admin login successful',
      token,
      user: {
        email: data.email,
        name: data.name || '',
        role: 'admin',
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Internal error', details: err.message });
  }
};

module.exports = {
  signup,
  signin,
  loginPsychiatrist,
  loginAdmin,
};
