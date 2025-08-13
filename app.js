const dotenv = require('dotenv');
const express = require('express');
const https = require('https');
const path = require('path');
const app = express();
const port = 3000;

dotenv.config();

const logStream = fs.createWriteStream('server.log', { flags: 'a' });

function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp} - ${message}\n`;
  logStream.write(logMessage);
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
  log('GET / - Served index.html');
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
  log(`Server is running on port ${port}`);
});
