const cloud = require('wx-server-sdk');
const { execSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// ffmpeg binary is bundled alongside index.js
const FFMPEG = path.join(__dirname, 'ffmpeg');

exports.main = async (event, context) => {
  const { fileID, startTime, endTime, fileName } = event;

  if (!fileID || startTime === undefined || endTime === undefined) {
    return { success: false, error: 'Missing parameters: fileID, startTime, endTime' };
  }

  if (startTime >= endTime) {
    return { success: false, error: 'startTime must be less than endTime' };
  }

  const tmpDir = os.tmpdir();
  const id = Date.now();
  const ext = path.extname(fileName || 'audio.mp3') || '.mp3';
  const inputFile = path.join(tmpDir, `input_${id}${ext}`);
  const outputFile = path.join(tmpDir, `output_${id}${ext}`);

  try {
    // 1. Download original file from cloud storage
    const downloadRes = await cloud.downloadFile({ fileID });
    fs.writeFileSync(inputFile, downloadRes.fileContent);

    // 2. Execute ffmpeg trim — try stream copy first, fallback to re-encode
    const cmd = `${FFMPEG} -i "${inputFile}" -ss ${startTime} -to ${endTime} -c copy -y "${outputFile}"`;
    try {
      execSync(cmd, { timeout: 30000, stdio: 'pipe' });
    } catch (_) {
      const fallback = `${FFMPEG} -i "${inputFile}" -ss ${startTime} -to ${endTime} -c:a aac -b:a 192k -y "${outputFile}"`;
      execSync(fallback, { timeout: 30000, stdio: 'pipe' });
    }

    // 3. Upload result to cloud storage
    const uploadRes = await cloud.uploadFile({
      cloudPath: `audio-trim/output/${id}_trimmed${ext}`,
      fileContent: fs.readFileSync(outputFile)
    });

    // 4. Cleanup temp files
    try { fs.unlinkSync(inputFile); } catch (_) {}
    try { fs.unlinkSync(outputFile); } catch (_) {}

    return {
      success: true,
      fileID: uploadRes.fileID
    };

  } catch (err) {
    console.error('audioTrim error:', err);
    try { fs.unlinkSync(inputFile); } catch (_) {}
    try { fs.unlinkSync(outputFile); } catch (_) {}
    return {
      success: false,
      error: err.message || 'Audio trimming failed'
    };
  }
};
