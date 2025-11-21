const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', port: PORT, time: new Date().toISOString() });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
});

server.on('error', (err) => {
  console.error('❌ Server error:', err);
  process.exit(1);
});