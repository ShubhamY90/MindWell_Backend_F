# MindWell Backend

## Project Overview

MindWell is a comprehensive mental health platform designed to connect students with psychiatrists through secure chat, provide AI-powered therapeutic conversations, and offer mood assessment tools. The backend is built with Node.js (Express) for the main API and Python (FastAPI) for text moderation services.

The platform enables:
- User authentication (students, psychiatrists, admins)
- Request system for student-psychiatrist connections
- Secure chat functionality with AI therapist integration
- Mood assessment and analysis using standardized scales (GAD-7, PHQ-9, etc.)
- Text moderation to ensure safe conversations
- Resource recommendations (videos, books)

## Setup and Installation

### Prerequisites
- Node.js (v16 or higher)
- Python (v3.8 or higher)
- Firebase project with Firestore and Authentication enabled
- Google Cloud API keys (Gemini AI, YouTube Data API)
- SMTP server for email notifications

### Installation Steps

1. **Clone the repository and navigate to the backend directory:**
   ```bash
   cd /path/to/MindWell/backend/backend
   ```

2. **Install Node.js dependencies:**
   ```bash
   npm install
   ```

3. **Install Python dependencies for the moderator service:**
   ```bash
   cd moderator
   pip install -r requirements.txt
   cd ..
   ```

4. **Set up environment variables:**
   Create a `.env` file in the root directory with the following variables:
   ```
   # Firebase Configuration
   FIREBASE_PROJECT_ID=your_project_id
   FIREBASE_PRIVATE_KEY_ID=your_private_key_id
   FIREBASE_PRIVATE_KEY=your_private_key
   FIREBASE_CLIENT_EMAIL=your_client_email
   FIREBASE_CLIENT_ID=your_client_id
   FIREBASE_AUTH_URI=https://accounts.google.com/o/oauth2/auth
   FIREBASE_TOKEN_URI=https://oauth2.googleapis.com/token
   FIREBASE_AUTH_PROVIDER_CERT_URL=https://www.googleapis.com/oauth2/v1/certs
   FIREBASE_CLIENT_CERT_URL=your_client_cert_url

   # API Keys
   GEMINI_API_KEY=your_gemini_api_key
   YT_API_KEY=your_youtube_api_key

   # Email Configuration
   SMTP_HOST=your_smtp_host
   SMTP_PORT=587
   SMTP_USER=your_smtp_user
   SMTP_PASS=your_smtp_password
   FROM_EMAIL=your_from_email

   # JWT Secret
   JWT_SECRET=your_jwt_secret
   ```

### Running the Services

1. **Start the main backend server:**
   ```bash
   npm run dev
   ```
   The server will run on `http://localhost:4000`

2. **Start the moderator service (in a separate terminal):**
   ```bash
   cd moderator
   uvicorn main:app --reload
   ```
   The moderator service will run on `http://localhost:8000`

## Project Structure

### Root Files
- **index.js**: Main entry point for the Express application. Sets up middleware (CORS, JSON parsing), registers routes, and starts the server on port 4000.
- **package.json**: Defines project metadata, scripts (`start`, `dev`), and dependencies including Express, Firebase Admin, Google AI libraries, and more.
- **package-lock.json**: Locks dependency versions for consistent installations.
- **.gitignore**: Specifies files to ignore in version control (e.g., node_modules, .env).
- **.renderignore**: Configuration for deployment on Render platform.

### config/
- **firebase.js**: Initializes Firebase Admin SDK with credentials from environment variables. Provides access to Firestore database and authentication services.

### controllers/
Contains business logic for different API functionalities:

- **authController.js**: Handles user authentication including:
  - `signup`: Verifies Firebase ID token and creates user in Firestore with default 'student' role
  - `signin`: Authenticates users via Firebase token and retrieves role from database
  - `loginPsychiatrist`: Email/password login for psychiatrists with JWT token generation
  - `loginAdmin`: Email/password login for admins with JWT token generation

- **chatController.js**: Manages chat and AI interactions:
  - `chatWithGemini`: Processes chat messages with Google's Gemini AI, maintains conversation history, and optionally suggests YouTube videos based on AI responses
  - `analyzeMoodTest`: Analyzes mood assessment responses using standardized scales (GAD-7, PHQ-9, PSS-10, etc.) and provides personalized insights and recommendations

- **requestController.js**: Manages the request system for student-psychiatrist connections:
  - `createRequest`: Creates new connection requests in Firestore
  - `respondToRequest`: Handles acceptance/rejection of requests (legacy)
  - `respondToRequestAtomic`: Atomic version of request response with email notifications and automatic chat creation
  - `listRequestsByCollege`: Retrieves requests filtered by college and status

- **DbController.js**: Handles database operations and user management (specific details depend on implementation).

- **suggestResourcesController.js**: Provides resource suggestions based on user needs (specific details depend on implementation).

### routes/
Defines API endpoints and maps them to controller functions:

- **authRoutes.js**: Authentication endpoints (`/api/auth/signup`, `/api/auth/signin`, `/api/auth/login-psychiatrist`, `/api/auth/login-admin`)

- **chatRoutes.js**: Chat and AI endpoints (`/api/chat`, `/api/analyze-mood`)

- **requestRoutes.js**: Request management endpoints:
  - `POST /api/request/create`: Create new request
  - `POST /api/request/respond/:id`: Respond to request (legacy)
  - `POST /api/request/respond-atomic/:id`: Atomic response to request
  - `GET /api/request/college/:college`: List requests by college

- **dbRoutes.js**: Database-related endpoints (specific routes depend on implementation).

### moderator/
Python service for content moderation:

- **main.py**: FastAPI application that provides text moderation using the `unitary/toxic-bert` model from Hugging Face Transformers. Includes endpoints:
  - `POST /moderate`: Analyzes text for toxicity and returns classification scores
  - `GET /`: Health check endpoint

- **requirements.txt**: Python dependencies (FastAPI, Uvicorn, Transformers, Torch)

### scripts/
Utility scripts for administrative tasks:

- **createAdmin.js**: Script to create admin users in the system
- **updateAdminPassword.js**: Script to update admin passwords

### uploads/
Directory for storing uploaded files (e.g., user profile pictures, documents). Files are stored with hashed filenames for security.

## Key Components

### Authentication System
The platform supports multiple authentication methods:
- **Firebase Authentication**: For students using email/password or social login
- **Custom Authentication**: For psychiatrists and admins using email/password with bcrypt hashing and JWT tokens
- **Role-based Access**: Three roles (student, psychiatrist, admin) with different permissions

### Chat and AI Integration
- **Gemini AI Integration**: Uses Google's Gemini models (1.5-pro for complex queries, 2.0-flash for simple) with custom system instructions to act as a warm, human-like therapist
- **Conversation History**: Maintains chat history in Firestore for continuity
- **Resource Suggestions**: Automatically suggests relevant YouTube videos when appropriate
- **Mood Analysis**: Processes standardized mental health assessments and provides detailed, personalized analysis

### Request Management
- **Connection Requests**: Students can request connections to psychiatrists based on college
- **Atomic Operations**: Uses Firestore transactions to prevent race conditions in request acceptance
- **Automated Notifications**: Sends email confirmations and creates chat sessions upon acceptance
- **Filtering**: Allows listing requests by college and status for administrative purposes

### Text Moderation
- **BERT-based Classification**: Uses pre-trained toxic-bert model to detect harmful content
- **Real-time Analysis**: Processes text inputs and returns toxicity scores
- **Safety Measures**: Helps maintain safe conversation environments

## Dependencies

### Node.js Dependencies
- **express**: Web framework for building the API
- **cors**: Enables Cross-Origin Resource Sharing
- **dotenv**: Loads environment variables from .env file
- **firebase-admin**: Firebase Admin SDK for authentication and database
- **@google/generative-ai**: Google's Generative AI library for Gemini integration
- **@google-cloud/speech** & **@google-cloud/text-to-speech**: Google Cloud speech services
- **bcrypt**: Password hashing
- **jsonwebtoken**: JWT token generation and verification
- **nodemailer**: Email sending functionality
- **multer**: File upload handling
- **axios**: HTTP client for external API calls
- **date-fns**: Date utility functions

### Python Dependencies
- **fastapi**: Modern web framework for building APIs
- **uvicorn**: ASGI server for running FastAPI applications
- **transformers**: Hugging Face library for NLP models
- **torch**: PyTorch deep learning framework

## Environment Variables

### Required Variables
- **Firebase Configuration**: 8 variables for Firebase Admin SDK initialization
- **API Keys**: GEMINI_API_KEY for AI chat, YT_API_KEY for YouTube video suggestions
- **Email Configuration**: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, FROM_EMAIL for email notifications
- **Security**: JWT_SECRET for token signing

### Optional Variables
- Some services may have fallback behaviors if certain variables are not set

## Running and Testing

### Development Mode
```bash
npm run dev
```
Starts the server with nodemon for automatic restarts on file changes.

### Production Mode
```bash
npm start
```

### Testing Endpoints
Use tools like Postman or curl to test API endpoints. Example:

```bash
# Health check
curl http://localhost:4000/api/status

# Test moderator
curl -X POST "http://localhost:8000/moderate" \
  -H "Content-Type: application/json" \
  -d '{"text": "This is a test message"}'
```

### Database
The application uses Firestore as its primary database. Ensure Firebase project is properly configured with Firestore enabled.

## Architecture Overview

```
┌─────────────────┐    ┌──────────────────┐
│   Frontend      │    │   MindWell       │
│   (React/Vue)   │◄──►│   Backend        │
└─────────────────┘    │                  │
                       │  ┌─────────────┐ │
                       │  │  Express   │ │
                       │  │   Server   │ │
                       │  └─────────────┘ │
                       │         │        │
                       │    ┌────▼────┐   │
                       │    │ Routes  │   │
                       │    └────┬────┘   │
                       │         │        │
                       │    ┌────▼────┐   │
                       │    │Controllers│ │
                       │    └────┬────┘   │
                       │         │        │
                       │    ┌────▼────┐   │
                       │    │ Firebase │   │
                       │    │ Firestore│   │
                       │    └─────────┘    │
                       │         │        │
                       │    ┌────▼────┐   │
                       │    │Moderator│   │
                       │    │ (Python) │   │
                       │    └─────────┘    │
                       └──────────────────┘
```

## Security Considerations

- **Authentication**: Firebase Auth for students, JWT for professionals
- **Authorization**: Role-based access control
- **Data Validation**: Input validation on all endpoints
- **HTTPS**: Recommended for production deployments
- **Environment Variables**: Sensitive data stored securely
- **Content Moderation**: AI-powered toxicity detection

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes and test thoroughly
4. Submit a pull request with detailed description

## Contact

For questions or support, please contact the development team or create an issue in the repository.

---

*This README provides a comprehensive overview of the MindWell backend architecture and functionality. For detailed implementation specifics, refer to the individual source files.*
