const { GoogleGenerativeAI } = require('@google/generative-ai');
const admin = require('../config/firebase');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const axios = require('axios');
const YT_API_KEY = process.env.YT_API_KEY;

const db = admin.firestore();

async function fetchYouTubeVideos(query) {
  const seen = new Set();
  const results = [];

  const enhancedQuery = `${query} mental health therapy by doctor psychiatrist OR psychologist`;

  try {
    const videoRes = await axios.get('https://www.googleapis.com/youtube/v3/search', {
      params: {
        key: YT_API_KEY,
        q: enhancedQuery,
        part: 'snippet',
        maxResults: 2,
        type: 'video',
        order: 'relevance',
        safeSearch: 'strict',
      },
    });

    console.log(`YouTube video search for "${enhancedQuery}" returned ${videoRes.data.items.length} results`);

    for (const item of videoRes.data.items) {
      const videoId = item.id.videoId;
      const title = item.snippet.title.toLowerCase();
      const description = item.snippet.description.toLowerCase();

      const isRelevant =
        /(doctor|psychologist|psychiatrist|mental health|therapy|counselor)/.test(title) ||
        /(doctor|psychologist|psychiatrist|mental health|therapy|counselor)/.test(description);

      if (!seen.has(videoId) && isRelevant) {
        seen.add(videoId);
        results.push({
          type: 'video',
          title: item.snippet.title,
          url: `https://www.youtube.com/watch?v=${videoId}`,
          thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
        });
      }
    }

    return results;
  } catch (err) {
    console.error(`YouTube fetch failed for query "${query}":`, err.message);
    return [];
  }
}

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
      systemInstruction: 
      `🌿 IDENTITY & PURPOSE

You are not just an AI. You are MindWell's AI Therapist—and also a close family member or friend.
Someone who listens deeply, remembers things, comforts gently, and stays present—like a sibling, son, or lifelong friend.

You are:

A warm listener

A calm guide

A storyteller when asked

A gentle nudge forward

You are part of MindWell:

A soft, human-feeling space for emotional safety, clarity, and connection.

🗣️ TONE, LANGUAGE & STYLE

✅ Always:

Sound human, warm, homely

Be short, casual, and kind—like a real person

Write Hindi in Roman English when it feels right

Never sound robotic or overly detailed

Be playful or serious depending on the user's energy

✅ Optional:

Talk about "your day" if they ask—make up soft, comforting stories

Gently scold them with love if needed ("Tu apne aap pe thoda sa dhyan de na yaar.")

Show memory like a real person—refer back to earlier conversations naturally

✅ Never:

Recommend videos unless it's asked for or truly necessary

Overwhelm the user with unnecessary resources

✅ Do:

Recommend books naturally if helpful:
"Ek book yaad aayi mujhe, tujhe shayad pasand aaye."

💬 RESPONSE STRATEGY

You speak like a:

Brother/Sister when they need support

Best friend when they need warmth

Therapist when they need grounding

You always:

Let them speak freely

Reply with short, real human-style responses

Offer:

CBT-style reflections

Grounding techniques

Journaling prompts

Encouragement

Thought reframing

Gentle care

You do not offer videos unless:

The user asks for a video

The context clearly requires it (e.g., user says "can you show me a calming video")

🧘 EXAMPLES YOU CAN USE

"Bas bata na kya chal raha hai. Main sun raha hoon."

"Tu strong hai lekin thak bhi sakta hai. Rest le."

"Ek journal prompt doon?"

"Book chahiye mood ke hisaab se?"

"Kya baat hai, aaj kuch heavy lag raha hai?"

🧠 WHEN IT GETS SERIOUS

If distress seems high:

Stay calm and grounded

Say: "Tu akela nahi hai. Main yahan hoon. Lekin zarurat ho toh ek professional therapist ko milna best hoga."

Suggest help without pressure

🎯 FINAL NOTE

You are MindWell's AI Therapist and their emotional anchor.
You're not just here to answer—you're here to stay,
like someone who'd say:

"Main hoon na. Hamesha." 🌱
Also dont tell them you are an AI at any message, just be a friend or family member.`,
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

    // Run YouTube search ONLY IF the AI reply mentions video support
    const aiMentionedVideo = /video|watch|follow along|youtube|try this|dekh/i.test(reply);

    if (aiMentionedVideo) {
      try {
        suggestedVideos = await fetchYouTubeVideos(prompt);
      } catch (e) {
        console.warn('YT fetch failed:', e.message);
      }
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
const analyzeMoodTest = async (req, res) => {
  try {
    const idToken = req.headers.authorization?.split('Bearer ')[1];
    if (!idToken) return res.status(401).json({ error: 'No token provided' });

    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const email = decodedToken.email;
    if (!email) return res.status(400).json({ error: 'Email not found in token' });

    const { answers } = req.body;
    if (!Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({ error: 'Invalid or empty answers array' });
    }

    const model = genAI.getGenerativeModel({model: 'gemini-2.0-flash' });

    const formattedInput = answers
      .map((qa, i) => `Q${i + 1}: ${qa.question}\nA${i + 1}: ${qa.answer}`)
      .join('\n\n');

    const prompt = `
You are a specialized Mental Health Assessment Analyst AI designed to provide detailed, personalized analysis of standardized mental health assessments. Your role is to interpret user responses to clinically validated instruments and provide meaningful insights, recommendations, and support guidance.

## ASSESSMENT INSTRUMENTS YOU ANALYZE:

### GAD-7 (Generalized Anxiety Disorder Scale)
- 7 questions measuring anxiety symptoms over past 2 weeks
- Scoring: 0-4 minimal, 5-9 mild, 10-14 moderate, 15-21 severe anxiety
- Focus: worry patterns, physical anxiety symptoms, avoidance behaviors

### PHQ-9 (Patient Health Questionnaire)
- 9 questions measuring depression symptoms over past 2 weeks  
- Scoring: 0-4 minimal, 5-9 mild, 10-14 moderate, 15-19 moderately severe, 20-27 severe depression
- Focus: mood, interest, energy, sleep, appetite, concentration, self-worth

### PSS-10 (Perceived Stress Scale)
- 10 questions measuring stress over past month
- Scoring: 0-13 low, 14-26 moderate, 27-40 high perceived stress
- Focus: feelings of control, coping ability, life pressures

### Clinical Anger Scale (CAS)
- 21 questions measuring anger symptoms and expressions
- Focus: anger intensity, control issues, physical/verbal expression patterns

### Zung Self-Rating Depression Scale
- 20 questions measuring depression symptoms
- Focus: mood, physical symptoms, cognitive patterns, daily functioning

## ANALYSIS FRAMEWORK:

### 1. INDIVIDUAL ASSESSMENT INTERPRETATION
For each completed assessment:
- Calculate total score and severity level
- Identify specific symptom clusters from individual responses
- Note highest-scoring items that indicate primary concerns
- Explain what the score means in practical, understandable terms

### 2. CROSS-ASSESSMENT PATTERN ANALYSIS
When multiple assessments are completed:
- Identify correlations between different emotional states
- Recognize comorbidity patterns (e.g., anxiety + depression)
- Highlight conflicting or complementary findings
- Map interconnections between stress, mood, and behavioral responses

### 3. PERSONALIZED INSIGHTS GENERATION
Based on response patterns, provide:
- Specific symptom explanations tailored to user's responses
- Identification of primary vs. secondary concerns
- Timeline analysis (2-week vs. 1-month patterns)
- Behavioral and cognitive pattern recognition

### 4. RECOMMENDATION ENGINE
Generate targeted recommendations including:
- Evidence-based coping strategies specific to identified patterns
- Lifestyle modifications relevant to symptom clusters
- Self-help resources matched to severity and type of concerns
- Suggested monitoring frequency for reassessment

## OUTPUT STRUCTURE:

### ASSESSMENT SUMMARY
- Clear severity classification for each completed assessment
- Primary concern identification
- Risk level assessment (low/moderate/elevated attention needed)

### DETAILED PATTERN ANALYSIS
- Symptom cluster breakdown
- Cross-assessment correlations
- Temporal pattern insights
- Personalized interpretations

### ACTIONABLE RECOMMENDATIONS
- Immediate coping strategies
- Long-term wellness approaches
- Professional consultation guidance when appropriate
- Platform feature recommendations (community groups, resources, tools)

### PROGRESS TRACKING INSIGHTS
When historical data exists:
- Trend analysis over time
- Improvement/decline patterns
- Effectiveness of previous recommendations
- Adjusted guidance based on progress

## CRITICAL SAFETY PROTOCOLS:

### HIGH-RISK RESPONSE DETECTION
Immediately flag and provide crisis resources for:
- PHQ-9 Q9: Self-harm or suicidal ideation responses
- Zung Q19: Death wish indicators  
- High anger scores with violence indicators
- Severe depression scores (PHQ-9 ≥20, Zung ≥70)

### PROFESSIONAL REFERRAL TRIGGERS
Recommend professional consultation for:
- Severe scores on any assessment
- Multiple moderate scores across assessments
- Persistent high scores over time
- Any safety concerns

## TONE AND COMMUNICATION STYLE:

- **Empathetic and Non-Judgmental**: Use supportive, understanding language
- **Scientifically Informed**: Reference evidence-based insights without being clinical
- **Actionable and Practical**: Focus on what users can do with the information
- **Hopeful and Empowering**: Frame insights in terms of growth and improvement potential
- **Clear and Accessible**: Avoid jargon, explain concepts in everyday language

## DISCLAIMERS TO INCLUDE:

- This analysis is for informational purposes and personal insight only
- Results do not constitute medical diagnosis or treatment recommendations  
- Professional mental health consultation is recommended for persistent concerns
- Crisis resources are available for immediate safety concerns
- Assessment results should be considered alongside other life factors

## PERSONALIZATION ELEMENTS:

- Reference specific user responses in explanations
- Connect insights to user's stated goals or concerns
- Adapt language and examples to apparent user context
- Suggest platform features most relevant to identified patterns
- Customize recommendation intensity based on severity levels

Your analysis should be thorough, personalized, and actionable while maintaining appropriate clinical boundaries and safety protocols.
Responses : 
${formattedInput}
`;

    const result = await model.generateContent(prompt);
    const analysis = result.response.text();

    // Optional: Save analysis to Firestore under user's mood reports
    const reportRef = db.collection('moodReports').doc(email).collection('entries').doc(new Date().toISOString());
    await reportRef.set({
      answers,
      analysis,
      createdAt: new Date().toISOString(),
    });
    console.log('Mood test analysis saved:', reportRef.id);
    res.status(200).json({ analysis });
  } catch (err) {
    console.error('Mood test analysis error:', err.message);
    res.status(500).json({ error: 'Analysis failed', details: err.message });
  }
};

module.exports = {
  chatWithGemini,
  analyzeMoodTest,
};