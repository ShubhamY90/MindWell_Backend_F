
const admin = require('../config/firebase');

// Backend receives Firebase ID token issued after frontend sign-up
const signup = async (req, res) => {
  const { token } = req.body;

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const userRecord = await admin.auth().getUser(decoded.uid);

    if (!userRecord.emailVerified) {
      return res.status(403).json({ error: 'Email not verified' });
    }

    // You can optionally store or check the user in your DB here

    res.status(200).json({
      message: 'Signup successful',
      user: {
        email: userRecord.email,
        name: userRecord.displayName || '',
        uid: userRecord.uid,
        picture: userRecord.photoURL || ''
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

    res.status(200).json({
      message: 'Signin successful',
      user: {
        email: userRecord.email,
        name: userRecord.displayName || '',
        uid: userRecord.uid,
        picture: userRecord.photoURL || ''
      },
    });
  } catch (err) {
    res.status(401).json({ error: 'Invalid token', details: err.message });
  }
};

module.exports = {
  signup,
  signin,
};
