// app.js
App({
  globalData: {
    env: "cloud1-d3geah2hy20028cb5",
    nickName: ''
  },

  onLaunch: function () {
    wx.cloud.init({
      env: this.globalData.env,
      traceUser: true,
    });

    this.checkNickname();
  },

  // 检查本地是否保持过昵称，没有就让用户输入
  checkNickname: function () {
    const stored = wx.getStorageSync('nickName');
    if (stored && stored != '无名') {
      this.globalData.nickName = stored;
    } else {
      wx.showModal({
        title: '设置昵称',
        editable: true,
        placeholderText: '输入你在打卡里的名字',
        success: (res) => {
          if (res.confirm && res.content) {
            const name = res.content.trim();
            this.globalData.nickName = name;
            wx.setStorageSync('nickName', name)
          } else {
            // 如果没填，给个默认昵称
            this.globalData.nickName = '无名';
            wx.setStorageSync('nickName', '无名');
          }
        }
      })
    }
  }
});
