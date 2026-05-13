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
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['mp3', 'aac', 'wav', 'm4a', 'flac', 'ogg', 'wma'],
      success: (res) => {
        const f = res.tempFiles[0];
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
  },

  // ========== Audio Context ==========

  _initAudioContext(src) {
    const ctx = wx.createInnerAudioContext();
    ctx.src = src;
    ctx.onTimeUpdate(() => {
      const t = ctx.currentTime;
      this.setData({ currentTime: t });
      if (this.data.isPreviewing && t >= this.data.trimEnd) {
        ctx.pause();
        this.setData({ isPreviewing: false, isPlaying: false });
      }
    });
    ctx.onEnded(() => {
      this.setData({ isPlaying: false, isPreviewing: false });
    });
    ctx.onCanplay(() => {
      this._pollDuration();
    });
    ctx.onError((err) => {
      console.error('Audio error:', err);
      wx.showToast({ title: '音频无法播放', icon: 'none' });
      this.setData({ isPlaying: false, isPreviewing: false });
    });
    this._audioCtx = ctx;
    // Start polling immediately — onCanplay may fire before duration is available
    this._pollDuration();
  },

  _pollDuration(retries) {
    retries = retries || 15;
    const ctx = this._audioCtx;
    if (!ctx) return;
    const d = ctx.duration;
    if (d && d > 0 && !isNaN(d)) {
      if (this.data.duration === 0) {
        this.setData({ duration: d, trimEnd: d });
      }
      return;
    }
    if (retries > 0) {
      setTimeout(() => this._pollDuration(retries - 1), 300);
    }
  },

  togglePlay() {
    if (!this._audioCtx) return;
    if (this.data.isPlaying) {
      this._audioCtx.pause();
      this.setData({ isPlaying: false });
    } else {
      // Resume from current position, or seek to trimStart if at the end
      if (this._audioCtx.currentTime >= this.data.trimEnd || this._audioCtx.currentTime < this.data.trimStart) {
        this._audioCtx.seek(Math.max(this.data.trimStart, 0));
      }
      this._audioCtx.play();
      this.setData({ isPlaying: true });
    }
  },

  // Progress bar seek for playback
  onProgressChanging(e) {
    const v = e.detail.value;
    this.setData({ currentTime: v });
  },

  onProgressChange(e) {
    const v = e.detail.value;
    if (this._audioCtx) {
      this._audioCtx.seek(v);
    }
    this.setData({ currentTime: v });
  },

  // Catch touchmove to prevent page scroll on mobile
  noop() {},

  // ========== Sliders ==========

  onStartSliderChanging(e) {
    const v = e.detail.value;
    if (v < this.data.trimEnd) {
      this.setData({ trimStart: v });
    }
  },

  onEndSliderChanging(e) {
    const v = e.detail.value;
    if (v > this.data.trimStart) {
      this.setData({ trimEnd: v });
    }
  },

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
      // Upload original file to cloud storage (sanitize path)
      const ext = (this.data.fileName.split('.').pop() || 'mp3').replace(/[^a-z0-9]/gi, '');
      const cloudPath = `audio-trim/input/${Date.now()}.${ext}`;
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath: cloudPath,
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

  // ========== Save / Share ==========

  saveToLocal() {
    const tempPath = this.data.resultTempPath;
    if (!tempPath) {
      wx.showToast({ title: '文件尚未就绪', icon: 'none' });
      return;
    }
    wx.openDocument({
      filePath: tempPath,
      showMenu: true,
      success: () => {
        wx.showToast({ title: '可通过右上角菜单保存', icon: 'none' });
      },
      fail: (err) => {
        console.error('打开失败:', err);
        wx.showToast({ title: '打开失败，请重试', icon: 'none' });
      }
    });
  },

  // ========== Cleanup ==========

  _destroyAudio() {
    if (this._audioCtx) { this._audioCtx.destroy(); this._audioCtx = null; }
    if (this._resultAudioCtx) { this._resultAudioCtx.destroy(); this._resultAudioCtx = null; }
  }
});
