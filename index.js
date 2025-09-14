const express =  require('express');
const cors =  require('cors');
const dotenv =  require('dotenv');
const chatRoutes =  require('./routes/chatRoutes.js');
const authRoutes =  require('./routes/authRoutes.js');
const dbRoutes =  require('./routes/dbRoutes.js');
const requestRoutes = require('./routes/requestRoutes.js');

dotenv.config();

const app = express();
app.use(cors({
  origin: "*",
  credentials: false,
}));

app.use(express.json());

app.use('/api', chatRoutes);
app.use('/api/auth', authRoutes);
app.use('/api', dbRoutes);
app.use('/api/request', requestRoutes);

app.listen(4000, () => {
  console.log('Backend running on http://localhost:4000');
});