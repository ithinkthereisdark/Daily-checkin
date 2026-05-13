const cloud = require('wx-server-sdk');
const { execSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// Copy ffmpeg to /tmp/ where we can set +x (code dir is read-only)
const FFMPEG_SRC = path.join(__dirname, 'ffmpeg');
const FFMPEG = path.join(os.tmpdir(), 'ffmpeg');

(function initFfmpeg() {
  try {
    if (!fs.existsSync(FFMPEG)) {
      fs.copyFileSync(FFMPEG_SRC, FFMPEG);
      fs.chmodSync(FFMPEG, 0o755);
    }
  } catch (_) {}
})();

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

    // 2. Execute ffmpeg trim
    // First try stream copy with keyframe alignment (fast + lossless)
    const copyCmd = `${FFMPEG} -i "${inputFile}" -ss ${startTime} -to ${endTime} -c copy -avoid_negative_ts make_zero -y "${outputFile}"`;
    try {
      execSync(copyCmd, { timeout: 30000, stdio: 'pipe' });
    } catch (_) {
      // Fallback: re-encode with high quality
      const reencodeCmd = `${FFMPEG} -i "${inputFile}" -ss ${startTime} -to ${endTime} -c:a aac -b:a 320k -y "${outputFile}"`;
      execSync(reencodeCmd, { timeout: 30000, stdio: 'pipe' });
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
