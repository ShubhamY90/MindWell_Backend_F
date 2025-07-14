const express =  require('express');
const cors =  require('cors');
const dotenv =  require('dotenv');
const chatRoutes =  require('./routes/chatRoutes.js');
// const authRoutes =  require('./routes/authRoutes.js');
const dbRoutes =  require('./routes/dbRoutes.js');

dotenv.config();

const app = express();
app.use(cors({
  origin: ['http://localhost:5173', 'https://rnchatbot.netlify.app'],
  credentials: true,
}));
app.use(express.json());

app.use('/api', chatRoutes);
// app.use('/api', authRoutes);
app.use('/api', dbRoutes);

app.listen(4000, () => {
  console.log('Backend running on http://localhost:4000');
});