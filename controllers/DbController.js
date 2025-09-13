const admin = require('../config/firebase.js');
const db = admin.firestore();


const getAllSessions = async (req, res) => {
  try {
    const idToken = req.headers.authorization?.split('Bearer ')[1];
    if (!idToken) return res.status(401).json({ error: 'No token provided' });

    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const email = decodedToken.email;
    if (!email) return res.status(400).json({ error: 'Email not found in token' });

    const sessionsSnap = await db
      .collection('chatbot')
      .doc(email)
      .collection('sessions')
      .orderBy('createdAt', 'desc')
      .get();

    const sessions = sessionsSnap.docs.map(doc => ({
      sessionRef: doc.id,
      ...doc.data()
    }));
    console.log(sessions);
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
    const email = decodedToken.email;
    if (!email) return res.status(400).json({ error: 'Email not found in token' });

    const { sessionRef } = req.params;
    if (!sessionRef) return res.status(400).json({ error: 'sessionRef is required' });

    console.log(`Fetching session ${sessionRef} for user ${email}`);
    // Fetch the specific session document


    const docRef = db
      .collection('chatbot')
      .doc(email)
      .collection('sessions')
      .doc(sessionRef);

    const sessionDoc = await docRef.get();
    if (!sessionDoc.exists) {
      return res.status(404).json({ error: 'Session not found' });
    }

    return res.json({ session: { sessionRef, ...sessionDoc.data() } });
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
    const email = decodedToken.email;
    if (!email) return res.status(400).json({ error: 'Email not found in token' });

    const sessionRef = req.params.sessionRef;
    console.log(`Deleting session ${sessionRef}`);

    // You can structure your Firestore path accordingly
    const docRef = db
      .collection('chatbot')
      .doc(email)
      .collection('sessions')
      .doc(sessionRef);

    await docRef.delete();

    console.log(`Session ${sessionRef} deleted successfully`);

    res.status(200).json({ message: 'Session deleted successfully', success: true });
  } catch (error) {
    console.error('Error deleting session:', error);
    res.status(500).json({ message: 'Failed to delete session', success: false});
  }
};


module.exports = {
    getAllSessions,
    getSessionById,
    deleteSession
};
