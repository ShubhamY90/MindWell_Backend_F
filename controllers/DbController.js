const admin = require('../config/firebase.js');
const db = admin.firestore();
const { decryptText } = require('../utils/cryptoUtils.js');


const getAllSessions = async (req, res) => {
  try {
    const idToken = req.headers.authorization?.split('Bearer ')[1];
    if (!idToken) return res.status(401).json({ error: 'No token provided' });

    const decodedToken = await admin.auth().verifyIdToken(idToken);
    console.log("Decoded Token:", decodedToken);
    const uid = decodedToken.uid;
    const email = decodedToken.email;
    if (!uid) return res.status(400).json({ error: 'UID not found in token' });

    // 🔍 Dual Lookup: Fetch from both new (UID) and legacy (Email) paths
    const [uidSnap, emailSnap] = await Promise.all([
      db.collection('chatbot').doc(uid).collection('sessions').get(),
      email ? db.collection('chatbot').doc(email).collection('sessions').get() : Promise.resolve({ docs: [] })
    ]);

    const sessionsMap = new Map();

    const processDocs = (docs) => {
      docs.forEach(doc => {
        let data = doc.data();

        // Decrypt text if encrypted payload exists
        try {
          if (data.prompt && data.prompt.data) { data.prompt = decryptText(data.prompt, email); }
          if (data.reply && data.reply.data) { data.reply = decryptText(data.reply, email); }

          if (data.history && Array.isArray(data.history)) {
            data.history = data.history.map(t => ({
              ...t,
              parts: t.parts?.map(p => ({
                text: p.encryptedPayload ? decryptText(p.encryptedPayload, email) : (p.text || "") // fallback to plaintext for old records
              }))
            }));
          }
        } catch (decErr) {
          console.error("Decryption failed for session", doc.id, decErr.message);
        }

        sessionsMap.set(doc.id, {
          sessionRef: doc.id,
          ...data,
          // Fallback for missing createdAt (use doc ID if it looks like a timestamp)
          createdAt: data.createdAt || (doc.id.includes('T') ? doc.id : new Date().toISOString())
        });
      });
    };

    processDocs(uidSnap.docs);
    processDocs(emailSnap.docs);

    const sessions = Array.from(sessionsMap.values())
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    console.log(`Found ${sessions.length} sessions for user ${uid}/${email}`);
    return res.json({ sessions });
  } catch (err) {
    console.error('Error fetching sessions:', err.message);
    res.status(500).json({ error: 'Failed to fetch sessions', details: err.message });
  }
};

const getSessionById = async (req, res) => {
  try {
    const idToken = req.headers.authorization?.split('Bearer ')[1];
    if (!idToken) return res.status(401).json({ error: 'No token provided' });

    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;
    const email = decodedToken.email;
    if (!uid) return res.status(400).json({ error: 'UID not found in token' });

    const { sessionRef } = req.params;
    if (!sessionRef) return res.status(400).json({ error: 'sessionRef is required' });

    console.log(`Fetching session ${sessionRef} for user ${uid}/${email}`);

    // Check UID path first, then Email path
    let sessionDoc = await db.collection('chatbot').doc(uid).collection('sessions').doc(sessionRef).get();

    if (!sessionDoc.exists && email) {
      sessionDoc = await db.collection('chatbot').doc(email).collection('sessions').doc(sessionRef).get();
    }

    if (!sessionDoc.exists) {
      return res.status(404).json({ error: 'Session not found' });
    }

    let data = sessionDoc.data();
    try {
      if (data.prompt && data.prompt.data) { data.prompt = decryptText(data.prompt, email); }
      if (data.reply && data.reply.data) { data.reply = decryptText(data.reply, email); }

      if (data.history && Array.isArray(data.history)) {
        data.history = data.history.map(t => ({
          ...t,
          parts: t.parts?.map(p => ({
            text: p.encryptedPayload ? decryptText(p.encryptedPayload, email) : (p.text || "")
          }))
        }));
      }
    } catch (decErr) {
      console.error("Decryption failed for session", sessionDoc.id, decErr.message);
    }

    return res.json({ session: { sessionRef, ...data } });
  } catch (err) {
    console.error('Error fetching session:', err.message);
    res.status(500).json({ error: 'Failed to fetch session', details: err.message });
  }
};

const deleteSession = async (req, res) => {
  try {
    const idToken = req.headers.authorization?.split('Bearer ')[1];
    if (!idToken) return res.status(401).json({ error: 'No token provided' });

    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;
    const email = decodedToken.email;
    if (!uid) return res.status(400).json({ error: 'UID not found in token' });

    const sessionRef = req.params.sessionRef;
    console.log(`Deleting session ${sessionRef} for user ${uid}/${email}`);

    // Delete from both paths if present
    await Promise.all([
      db.collection('chatbot').doc(uid).collection('sessions').doc(sessionRef).delete(),
      email ? db.collection('chatbot').doc(email).collection('sessions').doc(sessionRef).delete() : Promise.resolve()
    ]);

    console.log(`Session ${sessionRef} deleted successfully`);

    res.status(200).json({ message: 'Session deleted successfully', success: true });
  } catch (error) {
    console.error('Error deleting session:', error);
    res.status(500).json({ message: 'Failed to delete session', success: false });
  }
};


module.exports = {
  getAllSessions,
  getSessionById,
  deleteSession
};
