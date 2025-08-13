const dotenv = require('dotenv');
const express = require('express');
const https = require('https');
const path = require('path');
const app = express();
const port = 3000;
const gemini_api = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=";
const tts_api = "https://texttospeech.googleapis.com/v1/text:synthesize?key="
const fs = require('fs');

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

function sanitizeFilename(filename) {
  return filename
    .replace(/[^a-zA-Z0-9\s]/g, 'x')
    .replace(/\s+/g, '_');
}

app.post('/query', (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    log('POST /query - API key is not configured.');
    return res.status(500).send('API key is not configured.');
  }

  const prompt = req.body.prompt;
  const line = req.body.line;
  const postData = JSON.stringify({
    contents: [{parts: [{text: prompt + line}]}],
  });
  log(`POST /query - Sending data to Gemini API: ${postData}`);

  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  };

  const request = https.request(gemini_api + apiKey, options, (response) => {
    let data = '';

    response.on('data', (chunk) => {
      data += chunk;
    });

    response.on('end', () => {
      try {
        const jsonData = JSON.parse(data);
        if (jsonData.error) {
          log(`POST /query - Gemini API Error: ${jsonData.error.message}`);
          return res.status(500).send(jsonData.error.message);
        }

        let responseText = "";
        if (jsonData.candidates && jsonData.candidates.length > 0 && jsonData.candidates[0].content && jsonData.candidates[0].content.parts && jsonData.candidates[0].content.parts.length > 0) {
          responseText = jsonData.candidates[0].content.parts[0].text;
        }

        log(`POST /query - Sending response: ${responseText}`);
        res.json({ response: responseText });

        const directoryName = sanitizeFilename(prompt);
        const outputDir = path.join(__dirname, 'output', directoryName);

        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }

        const filename = `${sanitizeFilename(line)}.txt`;
        const filepath = path.join(outputDir, filename);

        fs.writeFile(filepath, responseText, (err) => {
          if (err) {
            log(`POST /query - Error saving to file: ${err}`);
            console.error('Error saving to file:', err);
          } else {
            log(`POST /query - Response saved to ${filepath}`);
          }
        });

      } catch (parseError) {
        log(`POST /query - Error parsing JSON: ${parseError}`);
        console.error('Error parsing JSON:', parseError);
        res.status(500).send('Error parsing the API response.');
      }
    });
  }).on("error", (err) => {
    log(`POST /query - Error: ${err.message}`);
    console.error("Error: ", err.message);
    res.status(500).send('An error occurred while processing your request.');
  });

  request.write(postData);
  request.end();
});

app.post('/tts', (req, res) => {
  const apiKey = process.env.TTS_API_KEY;

  if (!apiKey) {
    log('POST /tts - TTS API key is not configured.');
    return res.status(500).send('TTS API key is not configured.');
  }

  const prompt = req.body.prompt;
  const line = req.body.line;

  const text = fs.readFileSync(path.join(__dirname, 'output', sanitizeFilename(prompt), `${sanitizeFilename(line)}.txt`), 'utf8');

  if (!text) {
    log('POST /tts - No text provided for TTS.');
    return res.status(400).send('No text provided for TTS.');
  }

  const postData = JSON.stringify({
    input: {
      text: text
    },
    voice: {
      languageCode: 'en-US',
      name: 'en-US-Neural2-G'
    },
    audioConfig: {
      audioEncoding: 'MP3'
    }
  });

  log(`POST /tts - Sending data to TTS API: ${postData}`);

  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  };

  const request = https.request(tts_api + apiKey, options, (response) => {
    let data = '';

    response.on('data', (chunk) => {
      data += chunk;
    });

    response.on('end', () => {
      try {
        const jsonData = JSON.parse(data);
        log(`POST /tts - Received data from TTS API`);

        if (jsonData.error) {
          log(`POST /tts - TTS API Error: ${jsonData.error.message}`);
          return res.status(500).send(jsonData.error.message);
        }

        const audioContent = jsonData.audioContent;

        if (!audioContent) {
          log('POST /tts - No audio content received from TTS API.');
          return res.status(500).send('No audio content received from TTS API.');
        }

      } catch (parseError) {
        log(`POST /tts - Error parsing JSON: ${parseError}`);
        console.error('Error parsing JSON:', parseError);
        res.status(500).send('Error parsing the API response.');
      }
    });
  }).on("error", (err) => {
    log(`POST /tts - Error: ${err.message}`);
    console.error("Error: ", err.message);
    res.status(500).send('An error occurred while processing your request.');
  });

  request.write(postData);
  request.end();
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
  log(`Server is running on port ${port}`);
});
