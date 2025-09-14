const admin = require('../config/firebase');
const db = admin.firestore();

const createRequest = async (req, res) => {
  try {
    const { studentId, college, message, createdAt } = req.body;

    // Fetch student data from 'users' collection
    const studentDoc = await db.collection('users').doc(studentId).get();

    if (!studentDoc.exists) {
      return res.status(404).json({ error: "Student not found" });
    }

    const studentData = studentDoc.data();
    const studentName = studentData.name;
    const studentEmail = studentData.email;

    // Create a new request document
    const docRef = await db.collection('requests').add({
      studentId,
      studentName,
      studentEmail,
      college,
      message: message || "",
      createdAt: createdAt || new Date().toISOString(),
      status: "pending",       // default
      psychiatristId: null     // default
    });

    res.status(200).json({
      message: "Request created successfully",
      requestId: docRef.id
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


const respondToRequest = async (req, res) => {
  const { id } = req.params; // request document ID
  const { psychiatristId, action } = req.body; // action: "accept" or "reject"

  if (!["accept", "reject"].includes(action)) {
    return res.status(400).json({ error: "Invalid action. Must be 'accept' or 'reject'." });
  }

  try {
    const requestRef = db.collection('requests').doc(id);
    const requestDoc = await requestRef.get();

    if (!requestDoc.exists) {
      return res.status(404).json({ error: "Request not found." });
    }

    const requestData = requestDoc.data();

    // Only allow accepting if still pending
    if (action === "accept" && requestData.status !== "pending") {
      return res.status(400).json({ error: "Request has already been responded to." });
    }

    let psychiatristName = null;

    if (action === "accept") {
      // Fetch psychiatrist data from 'users' collection
      const psyDoc = await db.collection('users').doc(psychiatristId).get();

      if (!psyDoc.exists) {
        return res.status(404).json({ error: "Psychiatrist not found." });
      }

      const psyData = psyDoc.data();
      if (psyData.role !== 'psychiatrist') {
        return res.status(403).json({ error: "User is not a psychiatrist." });
      }

      psychiatristName = psyData.name;
    }

    const updateData = {
      status: action === "accept" ? "accepted" : "rejected",
      psychiatristId: action === "accept" ? psychiatristId : null,
      psychiatristName: action === "accept" ? psychiatristName : null,
      acceptedAt: action === "accept" ? new Date().toISOString() : null
    };

    await requestRef.update(updateData);

    res.status(200).json({ message: `Request ${action}ed successfully.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


module.exports = { createRequest, respondToRequest };

// List requests by college (and optional status)
const listRequestsByCollege = async (req, res) => {
  try {
    const { college } = req.params;
    const { status } = req.query; // optional: pending | accepted | rejected

    if (!college) {
      return res.status(400).json({ error: 'college param is required' });
    }

    let query = db.collection('requests').where('college', '==', college);
    if (status) {
      query = query.where('status', '==', status);
    }

    // Avoid requiring a composite index by not ordering in Firestore; sort in memory instead
    const snap = await query.get();
    const items = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const aTime = new Date(a.createdAt || 0).getTime();
        const bTime = new Date(b.createdAt || 0).getTime();
        return bTime - aTime; // descending
      });
    return res.status(200).json({ requests: items });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// Atomic accept/reject using a transaction to avoid races
const respondToRequestAtomic = async (req, res) => {
  const { id } = req.params;
  const { psychiatristId, action } = req.body;

  if (!['accept', 'reject'].includes(action)) {
    return res.status(400).json({ error: "Invalid action. Must be 'accept' or 'reject'." });
  }

  try {
    const requestRef = db.collection('requests').doc(id);

    let psychiatristName = null;
    if (action === 'accept') {
      const psyDoc = await db.collection('users').doc(psychiatristId).get();
      if (!psyDoc.exists) {
        return res.status(404).json({ error: 'Psychiatrist not found.' });
      }
      
      const psyData = psyDoc.data();
      if (psyData.role !== 'psychiatrist') {
        return res.status(403).json({ error: 'User is not a psychiatrist.' });
      }
      
      psychiatristName = psyData.name;
    }

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(requestRef);
      if (!snap.exists) {
        throw new Error('Request not found.');
      }
      const data = snap.data();
      if (action === 'accept' && data.status !== 'pending') {
        throw new Error('Request has already been responded to.');
      }
      const updateData = {
        status: action === 'accept' ? 'accepted' : 'rejected',
        psychiatristId: action === 'accept' ? psychiatristId : null,
        psychiatristName: action === 'accept' ? psychiatristName : null,
        acceptedAt: action === 'accept' ? new Date().toISOString() : null,
      };
      tx.update(requestRef, updateData);
    });

    return res.status(200).json({ message: `Request ${action}ed successfully.` });
  } catch (err) {
    const msg = err.message || 'Failed to respond to request';
    if (msg.includes('already been responded')) {
      return res.status(409).json({ error: msg });
    }
    if (msg.includes('Request not found')) {
      return res.status(404).json({ error: msg });
    }
    return res.status(500).json({ error: msg });
  }
};

module.exports = {
  createRequest,
  respondToRequest,
  listRequestsByCollege,
  respondToRequestAtomic,
};