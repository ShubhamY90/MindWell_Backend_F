
const admin = require('../config/firebase');

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
    const userRef = db.collection('users').doc(userRecord.uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      const userData = {
        email: userRecord.email,
        name: userRecord.displayName || '',
        uid: userRecord.uid,
        picture: userRecord.photoURL || '',
        role: 'student', // Default role
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };
      await userRef.set(userData);

      // Set custom claims for the first time
      await admin.auth().setCustomUserClaims(userRecord.uid, { role: 'student' });
    } else {
      // Ensure claims are synced even if doc existed
      const existingRole = userDoc.data().role || 'student';
      await admin.auth().setCustomUserClaims(userRecord.uid, { role: existingRole });
    }

    res.status(200).json({
      message: 'Signup successful',
      user: {
        email: userRecord.email,
        name: userRecord.displayName || '',
        uid: userRecord.uid,
        picture: userRecord.photoURL || '',
        role: userDoc.exists ? userDoc.data().role : 'student'
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
    const userRef = db.collection('users').doc(userRecord.uid);
    let userDoc = await userRef.get();

    // Fallback search by email if UID not found (migration)
    if (!userDoc.exists) {
      const q = await db.collection('users').where('email', '==', userRecord.email).limit(1).get();
      if (!q.empty) {
        userDoc = q.docs[0];
        // Migrate to UID-based doc ID
        await db.collection('users').doc(userRecord.uid).set({
          ...userDoc.data(),
          uid: userRecord.uid
        });
        // Optionally delete old email-based doc if you are SURE
        // await db.collection('users').doc(userRecord.email.toLowerCase()).delete();
      }
    }

    let userRole = 'student'; // Default role
    if (userDoc.exists) {
      userRole = userDoc.data().role || 'student';
    }

    // Consistently sync custom claims on signin
    await admin.auth().setCustomUserClaims(userRecord.uid, { role: userRole });

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


module.exports = {
  signup,
  signin,
};
