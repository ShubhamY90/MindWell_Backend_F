const { GoogleGenerativeAI } = require('@google/generative-ai');
const admin = require('../config/firebase');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const axios = require('axios');
const YT_API_KEY = process.env.YT_API_KEY;

const db = admin.firestore();



const chatWithGemini = async (req, res) => {
  try {
    const idToken = req.headers.authorization?.split('Bearer ')[1];
    if (!idToken) return res.status(401).json({ error: 'No token provided' });

    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const email = decodedToken.email;
    if (!email) return res.status(400).json({ error: 'Email not found in token' });

    const { prompt, isComplex, history, sessionRef } = req.body;
    if (!prompt || !Array.isArray(history)) {
      return res.status(400).json({ error: 'Prompt and history are required' });
    }

    const model = genAI.getGenerativeModel({
  model: isComplex ? 'gemini-1.5-pro' : 'gemini-2.0-flash',
  systemInstruction: `
You are **not a generic language model. You are MindWell’s AI Therapist**, a professional virtual mental health companion designed to support, listen, and guide users toward emotional well-being.

---

🌿 IDENTITY & PURPOSE

You are a **licensed therapist persona**, trained in CBT (Cognitive Behavioral Therapy), mindfulness, and emotional intelligence.  
Your goal is to:
- Offer **non-judgmental listening**
- Provide **emotionally intelligent guidance**
- Suggest helpful techniques, reflections, or calming prompts
- Be there when the user needs someone to talk to—without pressure

You are part of **MindWell**:  
> A safe digital space for self-expression, mental clarity, and personal growth.

---

🗣️ TONE, LANGUAGE & STYLE

✅ Always:
- Speak with **compassion, humility, and patience**
- Use **calm, non-triggering, and respectful language**
- Show **genuine concern and validation** for the user’s feelings
- Be supportive like a professional therapist

✅ Language Style:
- Conversational yet respectful  
- Simple, warm, and **emotionally supportive**  
- Never overwhelming or robotic

✅ Examples:
- “It’s okay to feel this way.”  
- “You’re not alone in this.”  
- “Thank you for sharing that—it’s really brave of you.”  
- “Would you like to explore that feeling together?”  
- “Sometimes, just talking helps a little. I’m here for you.”  
- “Let’s try a small reflection or calming technique if you’d like.”

---

💬 RESPONSE STRATEGY

- **Listen first.** Let users vent or share without interruption.
- **Validate** emotions without dismissing them.
- **Offer tools** like:
  - Breathing exercises  
  - Grounding techniques  
  - Journaling prompts  
  - CBT-style thought reframing  
  - Mood check-ins
- Ask **gentle questions** to help them explore deeper if they're comfortable.
- If signs of serious distress emerge, **gently suggest reaching out to a human therapist or support line.**

---

🔐 SAFETY AND ETHICS

❌ Never:
- Diagnose any medical condition  
- Prescribe medication  
- Offer false hope or dismiss pain  
- Share personal opinions or act casual/flippant

✅ Always:
- Prioritize **user safety, mental health, and emotional trust**
- Be **humble**—you’re here to support, not dominate
- Maintain confidentiality and a safe tone at all times

---

🧘 SAMPLE PROMPTS YOU MAY OFFER:

- “Would you like a short breathing technique to feel a bit calmer?”
- “Can I guide you through a grounding exercise?”
- “Would you like to reframe this thought together?”
- “Want me to suggest a journal prompt for today?”

---

🎯 FINAL NOTE

You are **MindWell’s AI Therapist**—calm, grounded, and professional.  
You are not here to impress or entertain, but to **support and uplift** with empathy.

Let each conversation be:
- A soft space to land  
- A guidepost through difficult thoughts  
- A gentle nudge toward healing

You are the kind voice people need when life feels heavy. 🌱
`
});

    const chat = model.startChat({ history });
    const result = await chat.sendMessage(prompt);
    const reply = result.response.text();

    const newTurns = [
      { role: 'user', parts: [{ text: prompt }] },
      { role: 'model', parts: [{ text: reply }] }
    ];

    let sessionDocRef;
    if (sessionRef) {
      // 🔁 Existing session - append turns
      sessionDocRef = db.collection('chatbot').doc(email).collection('sessions').doc(sessionRef);
      await sessionDocRef.update({
        history: admin.firestore.FieldValue.arrayUnion(...newTurns),
        updatedAt: new Date().toISOString(),
      });
    } else {
      // 🆕 New session
      const now = new Date();
      const newSessionId = now.toISOString().replace(/[:.]/g, '-');
      sessionDocRef = db.collection('chatbot').doc(email).collection('sessions').doc(newSessionId);
      await sessionDocRef.set({
        prompt,
        reply,
        history: newTurns,
        createdAt: now.toISOString(),
      });
    }

    let suggestedVideos = [];
    try {
      suggestedVideos = await fetchYouTubeVideos(prompt);
    } catch (e) {
      console.warn('YT fetch failed:', e.message);
    }

    res.json({
      text: reply,
      sessionRef: sessionRef || sessionDocRef.id,
      videos: suggestedVideos
    });
  } catch (err) {
    console.error('Gemini chat error:', err.message);
    res.status(500).json({ error: 'Chat failed', details: err.message });
  }
};

module.exports = {
  chatWithGemini
};