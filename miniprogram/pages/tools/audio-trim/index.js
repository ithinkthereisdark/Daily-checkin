const app = getApp();

Page({
  data: {
    step: 'idle',

    fileName: '',
    filePath: '',
    duration: 0,
    currentTime: 0,
    isPlaying: false,

    trimStart: 0,
    trimEnd: 0,

    isPreviewing: false,
    isProcessing: false,
    resultFileID: '',
    resultTempPath: '',
    isResultPlaying: false
  },

  _audioCtx: null,
  _resultAudioCtx: null,
  _previewTimer: null,

  onUnload() {
    this._destroyAudio();
  },

  // ========== Audio Selection ==========

  chooseAudio() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['audio'],
      sourceType: ['album'],
      success: (res) => {
        const file = res.tempFiles[0];
        if (file.duration > 600) {
          wx.showToast({ title: '暂不支持超过10分钟的音频', icon: 'none' });
          return;
        }
        this._destroyAudio();
        const duration = file.duration || 0;
        this.setData({
          step: 'selected',
          fileName: file.tempFilePath.split('/').pop() || '未命名音频',
          filePath: file.tempFilePath,
          duration: duration,
          currentTime: 0,
          isPlaying: false,
          trimStart: 0,
          trimEnd: duration,
          isPreviewing: false,
          resultFileID: '',
          resultTempPath: '',
          isResultPlaying: false
        });
        this._initAudioContext(file.tempFilePath);
      },
      fail: () => {
        // wx.chooseMedia may fail on some devices; fallback to chooseMessageFile
        wx.chooseMessageFile({
          count: 1,
          type: 'file',
          success: (res) => {
            const f = res.tempFiles[0];
            const nameLC = f.name.toLowerCase();
            const isAudio = nameLC.endsWith('.mp3') || nameLC.endsWith('.aac') || nameLC.endsWith('.wav') || nameLC.endsWith('.m4a');
            if (!isAudio) {
              wx.showToast({ title: '请选择音频文件', icon: 'none' });
              return;
            }
            this._destroyAudio();
            this.setData({
              step: 'selected',
              fileName: f.name,
              filePath: f.path,
              duration: 0,
              currentTime: 0,
              isPlaying: false,
              trimStart: 0,
              trimEnd: 0,
              isPreviewing: false,
              resultFileID: '',
              resultTempPath: '',
              isResultPlaying: false
            });
            this._initAudioContext(f.path);
          }
        });
      }
    });
  },

  // ========== Audio Context ==========

  _initAudioContext(src) {
    const ctx = wx.createInnerAudioContext();
    ctx.src = src;
    ctx.onTimeUpdate(() => {
      const t = ctx.currentTime;
      this.setData({ currentTime: t });
      // Auto-stop at trimEnd when previewing
      if (this.data.isPreviewing && t >= this.data.trimEnd) {
        ctx.pause();
        this.setData({ isPreviewing: false, isPlaying: false });
      }
    });
    ctx.onEnded(() => {
      this.setData({ isPlaying: false, isPreviewing: false });
    });
    ctx.onCanplay(() => {
      // Get actual duration once loaded if not already known
      const d = ctx.duration;
      if (d && d > 0 && this.data.duration === 0) {
        this.setData({ duration: d, trimEnd: d });
      }
    });
    ctx.onError((err) => {
      console.error('Audio error:', err);
      wx.showToast({ title: '音频无法播放', icon: 'none' });
      this.setData({ isPlaying: false, isPreviewing: false });
    });
    this._audioCtx = ctx;
  },

  togglePlay() {
    if (!this._audioCtx) return;
    if (this.data.isPlaying) {
      this._audioCtx.pause();
      this.setData({ isPlaying: false });
    } else {
      this._audioCtx.seek(this.data.trimStart);
      this._audioCtx.play();
      this.setData({ isPlaying: true });
    }
  },

  // ========== Sliders ==========

  onStartSliderChange(e) {
    const v = e.detail.value;
    if (v >= this.data.trimEnd - 0.5) {
      wx.showToast({ title: '起始需早于结束至少0.5秒', icon: 'none' });
      return;
    }
    this.setData({ trimStart: v });
  },

  onEndSliderChange(e) {
    const v = e.detail.value;
    if (v <= this.data.trimStart + 0.5) {
      wx.showToast({ title: '结束需晚于起始至少0.5秒', icon: 'none' });
      return;
    }
    this.setData({ trimEnd: v });
  },

  // ========== Preview ==========

  previewTrim() {
    if (!this._audioCtx) return;
    if (this.data.isPreviewing) {
      this._audioCtx.pause();
      this.setData({ isPreviewing: false, isPlaying: false });
      return;
    }
    this._audioCtx.seek(this.data.trimStart);
    this._audioCtx.play();
    this.setData({ isPreviewing: true, isPlaying: true });
  },

  // ========== Trim (main flow) ==========

  async startTrim() {
    const trimLength = this.data.trimEnd - this.data.trimStart;
    if (trimLength < 0.5) {
      wx.showToast({ title: '裁剪范围过短，至少0.5秒', icon: 'none' });
      return;
    }

    this.setData({ isProcessing: true });
    wx.showLoading({ title: '上传中...' });

    try {
      // Upload original file to cloud storage
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath: `audio-trim/input/${Date.now()}_${this.data.fileName}`,
        filePath: this.data.filePath
      });

      wx.showLoading({ title: '裁剪中...' });

      // Call cloud function
      const cfRes = await wx.cloud.callFunction({
        name: 'audioTrim',
        data: {
          fileID: uploadRes.fileID,
          startTime: this.data.trimStart,
          endTime: this.data.trimEnd,
          fileName: this.data.fileName
        }
      });

      if (!cfRes.result || !cfRes.result.success) {
        throw new Error(cfRes.result?.error || '裁剪失败');
      }

      const resultFileID = cfRes.result.fileID;

      // Download result for local playback
      const tempRes = await wx.cloud.downloadFile({ fileID: resultFileID });

      // Clean up input file (best effort)
      wx.cloud.deleteFile({ fileList: [uploadRes.fileID] }).catch(() => {});

      // Init result audio context
      if (this._resultAudioCtx) this._resultAudioCtx.destroy();
      const rCtx = wx.createInnerAudioContext();
      rCtx.src = tempRes.tempFilePath;
      rCtx.onEnded(() => { this.setData({ isResultPlaying: false }); });
      rCtx.onError(() => { wx.showToast({ title: '结果播放失败', icon: 'none' }); });
      this._resultAudioCtx = rCtx;

      this.setData({
        step: 'done',
        isProcessing: false,
        resultFileID: resultFileID,
        resultTempPath: tempRes.tempFilePath
      });

      wx.hideLoading();
      wx.showToast({ title: '裁剪完成', icon: 'success' });

    } catch (err) {
      wx.hideLoading();
      console.error('裁剪失败:', err);
      wx.showToast({ title: '裁剪失败，请重试', icon: 'none' });
      this.setData({ isProcessing: false });
    }
  },

  // ========== Result Playback ==========

  toggleResultPlay() {
    if (!this._resultAudioCtx) return;
    if (this.data.isResultPlaying) {
      this._resultAudioCtx.pause();
      this.setData({ isResultPlaying: false });
    } else {
      this._resultAudioCtx.play();
      this.setData({ isResultPlaying: true });
    }
  },

  // ========== Save to Local ==========

  saveToLocal() {
    if (!this.data.resultFileID) return;
    wx.showLoading({ title: '保存中...' });
    wx.cloud.downloadFile({ fileID: this.data.resultFileID })
      .then(res => {
        wx.hideLoading();
        wx.saveFile({
          tempFilePath: res.tempFilePath,
          success: () => {
            wx.showToast({ title: '已保存到本地', icon: 'success' });
          },
          fail: (err) => {
            console.error('Save failed:', err);
            wx.showToast({ title: '保存失败', icon: 'none' });
          }
        });
      })
      .catch(() => {
        wx.hideLoading();
        wx.showToast({ title: '下载失败', icon: 'none' });
      });
  },

  // ========== Cleanup ==========

  _destroyAudio() {
    if (this._audioCtx) { this._audioCtx.destroy(); this._audioCtx = null; }
    if (this._resultAudioCtx) { this._resultAudioCtx.destroy(); this._resultAudioCtx = null; }
  }
});
