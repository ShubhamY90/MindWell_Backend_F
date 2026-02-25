const admin = require('../config/firebase');
const db = admin.firestore();
const nodemailer = require('nodemailer');

// Lazy-init transporter
let emailTransporter = null;
function getEmailTransporter() {
  if (emailTransporter) return emailTransporter;
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    console.warn('Email not configured: missing SMTP env vars');
    return null;
  }
  emailTransporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  return emailTransporter;
}

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
    // Read request once to capture student details for side-effects (email/chat)
    const requestDocPre = await requestRef.get();
    if (!requestDocPre.exists) {
      return res.status(404).json({ error: 'Request not found.' });
    }
    const requestPre = requestDocPre.data();

    let psychiatristName = null;
    if (action === 'accept') {
      // Support psychiatristId being either UID or email
      let psyDoc = await db.collection('users').doc(psychiatristId).get();
      if (!psyDoc.exists) {
        const q = await db.collection('users').where('email', '==', psychiatristId).limit(1).get();
        if (!q.empty) {
          psyDoc = q.docs[0];
        }
      }
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

    // Side-effects after successful state change
    if (action === 'accept') {
      // 1) Send acceptance email to student (best-effort)
      try {
        const transporter = getEmailTransporter();
        // const transporter = getEmailTransporter();
        // if (transporter) {
        //   transporter.verify((err, success) => {
        //     if (err) {
        //       console.error("SMTP connection failed:", err);
        //     } else {
        //       console.log("SMTP server is ready to take messages");
        //     }
        //   });
        // }

        if (transporter && requestPre.studentEmail) {
          const fromEmail = process.env.FROM_EMAIL || process.env.SMTP_USER;
          await transporter.sendMail({
            from: fromEmail,
            to: requestPre.studentEmail,
            subject: 'Your MindWell request has been accepted',
            text: `Hello ${requestPre.studentName || ''},\n\nYour connection request has been accepted by ${psychiatristName}. You can now start chatting securely in MindWell.\n\nBest wishes,\nMindWell Team`,
            html: `<p>Hello ${requestPre.studentName || ''},</p>
                   <p>Your connection request has been <b>accepted</b> by ${psychiatristName}. You can now start chatting securely in MindWell.</p>
                   <p>Best wishes,<br/>MindWell Team</p>`,
          });
        }
      } catch (emailErr) {
        console.warn('Failed to send acceptance email:', emailErr?.message || emailErr);
      }

      // 2) Create or upsert a chat document between psychiatrist and student (best-effort)
      try {
        const studentId = requestPre.studentId;
        if (studentId && psychiatristId) {
          // Search for existing chat between these participants using UIDs
          const chatsRef = db.collection('chats');
          const candidate1 = await chatsRef
            .where('senderId', '==', psychiatristId)
            .where('receiverId', '==', studentId)
            .limit(1)
            .get();
          const candidate2 = await chatsRef
            .where('senderId', '==', studentId)
            .where('receiverId', '==', psychiatristId)
            .limit(1)
            .get();

          let chatDocRef = null;
          if (!candidate1.empty) chatDocRef = candidate1.docs[0].ref;
          else if (!candidate2.empty) chatDocRef = candidate2.docs[0].ref;

          if (!chatDocRef) {
            // Create chat document in the requested schema
            const newChat = await chatsRef.add({
              senderId: psychiatristId,
              receiverId: studentId,
              lastMessage: 'Request accepted. You can now chat.',
              lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            chatDocRef = newChat;

            // Optional: add a system/initial message in subcollection if requested
            await chatDocRef.collection('messages').add({
              senderId: psychiatristId,
              receiverId: studentId,
              text: 'Hello! I have accepted your request for support. How can I help you today?',
              timestamp: admin.firestore.FieldValue.serverTimestamp(),
            });
          }
        }
      } catch (chatErr) {
        console.warn('Failed to create chat record:', chatErr?.message || chatErr);
      }
    }

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