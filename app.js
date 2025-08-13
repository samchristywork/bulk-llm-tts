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
app.use('/output', express.static(path.join(__dirname, 'output')));

function sanitizeFilename(filename) {
  return filename
    .replace(/[^a-zA-Z0-9\s]/g, 'x')
    .replace(/\s+/g, '_');
}

app.post('/query', async (req, res) => {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const ttsApiKey = process.env.TTS_API_KEY;

  if (!geminiApiKey) {
    log('POST /query - Gemini API key is not configured.');
    return res.status(500).send('Gemini API key is not configured.');
  }

  if (!ttsApiKey) {
    log('POST /query - TTS API key is not configured.');
    return res.status(500).send('TTS API key is not configured.');
  }

  const prompt = req.body.prompt;
  const line = req.body.line;
  const combinedPrompt = prompt + line;

  const directoryName = sanitizeFilename(prompt);
  const outputDir = path.join(__dirname, 'output', directoryName);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const filenameBase = sanitizeFilename(line);
  const textFilepath = path.join(outputDir, `${filenameBase}.txt`);
  const mp3Filepath = path.join(outputDir, `${filenameBase}.mp3`);


  let geminiResponseText = "";
  try {
    const geminiPostData = JSON.stringify({
      contents: [{ parts: [{ text: combinedPrompt }] }],
    });

    log(`POST /query - Sending data to Gemini API: ${geminiPostData}`);

    const geminiOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    geminiResponseText = await new Promise((resolve, reject) => {
      const geminiRequest = https.request(gemini_api + geminiApiKey, geminiOptions, (response) => {
        let data = '';

        response.on('data', (chunk) => {
          data += chunk;
        });

        response.on('end', () => {
          try {
            const jsonData = JSON.parse(data);
            if (jsonData.error) {
              log(`POST /query - Gemini API Error: ${jsonData.error.message}`);
              return reject(jsonData.error.message);
            }

            let responseText = "";
            if (jsonData.candidates && jsonData.candidates.length > 0 && jsonData.candidates[0].content && jsonData.candidates[0].content.parts && jsonData.candidates[0].content.parts.length > 0) {
              responseText = jsonData.candidates[0].content.parts[0].text;
            }

            log(`POST /query - Received Gemini response: ${responseText}`);
            resolve(responseText);

          } catch (parseError) {
            log(`POST /query - Error parsing Gemini JSON: ${parseError}`);
            console.error('Error parsing JSON:', parseError);
            reject('Error parsing the Gemini API response.');
          }
        });
      }).on("error", (err) => {
        log(`POST /query - Gemini API Error: ${err.message}`);
        console.error("Error: ", err.message);
        reject('An error occurred while processing your request to Gemini.');
      });

      geminiRequest.write(geminiPostData);
      geminiRequest.end();
    });

    fs.writeFile(textFilepath, geminiResponseText, (err) => {
      if (err) {
        log(`POST /query - Error saving Gemini response to file: ${err}`);
        console.error('Error saving to file:', err);
      } else {
        log(`POST /query - Gemini response saved to ${textFilepath}`);
      }
    });
  } catch (error) {
    return res.status(500).send(error);
  }
  try {
    const ttsPostData = JSON.stringify({
      input: {
        text: geminiResponseText
      },
      voice: {
        languageCode: 'en-US',
        name: 'en-US-Neural2-G'
      },
      audioConfig: {
        audioEncoding: 'MP3'
      }
    });

    log(`POST /query - Sending data to TTS API: ${ttsPostData}`);

    const ttsOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const audioContent = await new Promise((resolve, reject) => {
      const ttsRequest = https.request(tts_api + ttsApiKey, ttsOptions, (response) => {
        let data = '';

        response.on('data', (chunk) => {
          data += chunk;
        });

        response.on('end', () => {
          try {
            const jsonData = JSON.parse(data);
            log(`POST /query - Received data from TTS API`);

            if (jsonData.error) {
              log(`POST /query - TTS API Error: ${jsonData.error.message}`);
              return reject(jsonData.error.message);
            }

            const audioContent = jsonData.audioContent;

            if (!audioContent) {
              log('POST /query - No audio content received from TTS API.');
              return reject('No audio content received from TTS API.');
            }

            resolve(audioContent);

          } catch (parseError) {
            log(`POST /query - Error parsing TTS JSON: ${parseError}`);
            console.error('Error parsing JSON:', parseError);
            reject('Error parsing the TTS API response.');
          }
        });
      }).on("error", (err) => {
        log(`POST /query - TTS API Error: ${err.message}`);
        console.error("Error: ", err.message);
        reject('An error occurred while processing your request to TTS.');
      });

      ttsRequest.write(ttsPostData);
      ttsRequest.end();
    });

    const audioBuffer = Buffer.from(audioContent, 'base64');

    fs.writeFile(mp3Filepath, audioBuffer, (err) => {
      if (err) {
        log(`POST /query - Error saving MP3 file: ${err}`);
        console.error('Error saving MP3 file:', err);
        return res.status(500).send('Error saving MP3 file.');
      } else {
        log(`POST /query - MP3 file saved to ${mp3Filepath}`);
        const filePath = `/output/${directoryName}/${filenameBase}.mp3`;
        res.json({ response: geminiResponseText, filePath: filePath });
      }
    });

  } catch (error) {
    return res.status(500).send(error);
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
  log(`Server is running on port ${port}`);
});
