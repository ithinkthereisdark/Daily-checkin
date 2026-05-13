Page({
  data: {
    tools: [
      {
        id: 'audio-trim',
        name: '音频剪辑',
        icon: '🎵',
        desc: '选择音频，自由裁剪片段',
        page: '/pages/tools/audio-trim/index'
      }
    ]
  },

  openAudioTrim() {
    wx.navigateTo({ url: '/pages/tools/audio-trim/index' });
  }
});
