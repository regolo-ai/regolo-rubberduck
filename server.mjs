import express from 'express';
import dotenv from 'dotenv';

import chatRouter from './src/routes/chat.mjs';
import { getModelsHandler } from './src/routes/models.mjs';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// CORS headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  next();
});

// Static file serving from public/
app.use(express.static('public'));

// JSON body parser
app.use(express.json());

// Chat endpoint - parallel queries to multiple models
app.use('/api', chatRouter);

// Models endpoint - proxies to Regolo API
app.get('/api/models', getModelsHandler);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
