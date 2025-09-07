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
      // Fetch psychiatrist data from 'psychiatrists' collection
      const psyDoc = await db.collection('psychiatrists').doc(psychiatristId).get();

      if (!psyDoc.exists) {
        return res.status(404).json({ error: "Psychiatrist not found." });
      }

      psychiatristName = psyDoc.data().name;
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
