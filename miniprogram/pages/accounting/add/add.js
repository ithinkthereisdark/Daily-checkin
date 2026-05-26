const db = wx.cloud.database();
const app = getApp();

function evaluate(expr) {
  expr = expr.replace(/[+\-]$/, '');
  if (!expr) return 0;
  const tokens = expr.split(/(\+|\-)/);
  let result = parseFloat(tokens[0]) || 0;
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i];
    const num = parseFloat(tokens[i + 1]) || 0;
    if (op === '+') result += num;
    else if (op === '-') result -= num;
  }
  return result;
}

const EXPENSE_CATEGORIES = [
  { name: '餐饮', emoji: '🍽️' },
  { name: '交通', emoji: '🚌' },
  { name: '购物', emoji: '🛍️' },
  { name: '住房', emoji: '🏠' },
  { name: '娱乐', emoji: '🎮' },
  { name: '医疗', emoji: '💊' },
  { name: '教育', emoji: '📚' },
  { name: '通讯', emoji: '📱' },
  { name: '服饰', emoji: '👗' },
  { name: '美容', emoji: '💄' },
  { name: '运动', emoji: '🏃' },
  { name: '宠物', emoji: '🐱' },
  { name: '礼物', emoji: '🎁' },
  { name: '办公', emoji: '💼' },
  { name: '其他', emoji: '📌' }
];

const INCOME_CATEGORIES = [
  { name: '工资', emoji: '💰' },
  { name: '礼金', emoji: '🎁' },
  { name: '理财', emoji: '📈' },
  { name: '兼职', emoji: '💼' },
  { name: '报销', emoji: '📋' },
  { name: '退款', emoji: '↩️' },
  { name: '其他', emoji: '📌' }
];

Page({
  data: {
    isEdit: false,
    editId: '',
    ledgers: [],
    currentLedger: null,
    showLedgerPicker: false,
    type: 'expense',
    categories: EXPENSE_CATEGORIES,
    selectedCategory: '',
    selectedCategoryEmoji: '',
    description: '',
    date: '',
    expression: '',
    currentInput: '',
    result: '0',
    saving: false,
    customCategories: [],
    showCategoryForm: false,
    newCategoryName: '',
    newCategoryEmoji: '📌',
    categoryFormType: 'expense'
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ isEdit: true, editId: options.id });
      wx.setNavigationBarTitle({ title: '编辑记录' });
    } else {
      wx.setNavigationBarTitle({ title: '记一笔' });
    }
    this.setData({
      date: this.todayStr(),
      preferredLedgerId: options.ledgerId || ''
    });
    const isEdit = this.data.isEdit && this.data.editId;
    Promise.all([this.loadLedgers(), this.loadCustomCategories()]).then(() => {
      if (isEdit) {
        this.loadTransaction();
      }
    });
  },

  todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  loadLedgers() {
    const nickName = app.globalData.nickName;
    return db.collection('ledgers').where({ nickName }).orderBy('createTime', 'asc').get()
      .then(res => {
        const ledgers = res.data;
        let currentLedger = ledgers[0];

        const lastId = this.data.preferredLedgerId || wx.getStorageSync('lastLedgerId');
        if (lastId) {
          const found = ledgers.find(l => l._id === lastId);
          if (found) currentLedger = found;
        }
        if (!currentLedger) {
          currentLedger = ledgers.find(l => l.isDefault) || ledgers[0];
        }

        this.setData({ ledgers, currentLedger });
      })
      .catch(err => {
        if (err.errCode !== -502005) {
          console.error('Load ledgers failed:', err);
        }
      });
  },

  loadTransaction() {
    db.collection('transactions').doc(this.data.editId).get()
      .then(res => {
        const tx = res.data;
        if (!tx) return;
        const currentLedger = this.data.ledgers.find(l => l._id === tx.ledgerId) || this.data.currentLedger;
        this.setData({
          currentLedger,
          type: tx.type,
          selectedCategory: tx.category,
          selectedCategoryEmoji: tx.categoryEmoji,
          description: tx.description || '',
          date: tx.date,
          expression: String(tx.amount),
          currentInput: '',
          result: String(tx.amount)
        });
        this.mergeCategories();
      })
      .catch(err => {
        console.error('Load transaction failed:', err);
      });
  },

  toggleLedgerPicker() {
    this.setData({ showLedgerPicker: !this.data.showLedgerPicker });
  },

  switchLedger(e) {
    const id = e.currentTarget.dataset.id;
    const ledger = this.data.ledgers.find(l => l._id === id);
    if (ledger) {
      this.setData({ currentLedger: ledger, showLedgerPicker: false });
    }
  },

  switchType(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({
      type,
      selectedCategory: '',
      selectedCategoryEmoji: ''
    });
    this.mergeCategories();
  },

  selectCategory(e) {
    const { name, emoji } = e.currentTarget.dataset;
    this.setData({
      selectedCategory: name,
      selectedCategoryEmoji: emoji
    });
  },

  onDescInput(e) {
    this.setData({ description: e.detail.value });
  },

  onDateChange(e) {
    this.setData({ date: e.detail.value });
  },

  // Calculator
  tapKey(e) {
    const key = e.currentTarget.dataset.key;
    let { expression, currentInput } = this.data;

    if (key === 'C') {
      this.setData({ expression: '', currentInput: '', result: '0' });
      return;
    }

    if (key === 'backspace') {
      if (currentInput.length > 0) {
        currentInput = currentInput.slice(0, -1);
      } else if (expression.length > 0) {
        expression = expression.replace(/[+\-]$/, '');
      }
      this.setData({ expression, currentInput });
      this.calcResult();
      return;
    }

    if (key === '+' || key === '-') {
      if (currentInput === '' && expression === '') return;
      if (currentInput === '') {
        expression = expression.replace(/[+\-]$/, '') + key;
      } else {
        expression += currentInput + key;
        currentInput = '';
      }
      this.setData({ expression, currentInput });
      this.calcResult();
      return;
    }

    if (key === '.') {
      if (currentInput.includes('.')) return;
      if (currentInput === '') currentInput = '0';
      currentInput += '.';
      this.setData({ currentInput });
      this.calcResult();
      return;
    }

    if (key === 'done') {
      this.submit();
      return;
    }

    // Digit key
    currentInput += key;
    this.setData({ currentInput });
    this.calcResult();
  },

  calcResult() {
    const { expression, currentInput } = this.data;
    const expr = expression + currentInput;
    if (!expr || expr === '-' || expr === '+') {
      this.setData({ result: '0' });
      return;
    }
    const val = evaluate(expr);
    if (isNaN(val) || !isFinite(val)) {
      this.setData({ result: '0' });
    } else {
      this.setData({ result: String(Math.round(val * 100) / 100) });
    }
  },

  submit() {
    const { selectedCategory, selectedCategoryEmoji, description, date, type, currentLedger, isEdit, editId, saving } = this.data;

    if (saving) return;
    if (!currentLedger) {
      wx.showToast({ title: '请选择账本', icon: 'none' });
      return;
    }
    if (!selectedCategory) {
      wx.showToast({ title: '请选择分类', icon: 'none' });
      return;
    }

    let { expression, currentInput } = this.data;
    const expr = expression + currentInput;
    const amount = evaluate(expr);

    if (!amount || amount <= 0) {
      wx.showToast({ title: '请输入金额', icon: 'none' });
      return;
    }

    const nickName = app.globalData.nickName;
    const data = {
      ledgerId: currentLedger._id,
      type,
      category: selectedCategory,
      categoryEmoji: selectedCategoryEmoji,
      amount: Math.round(amount * 100) / 100,
      description: description.trim(),
      date,
      nickName,
      createTime: new Date()
    };

    this.setData({ saving: true });

    if (isEdit) {
      db.collection('transactions').doc(editId).update({ data })
        .then(() => {
          wx.showToast({ title: '已更新', icon: 'success' });
          setTimeout(() => wx.navigateBack(), 600);
        })
        .catch(err => {
          console.error('Update failed:', err);
          wx.showToast({ title: '更新失败', icon: 'none' });
          this.setData({ saving: false });
        });
    } else {
      db.collection('transactions').add({ data })
        .then(() => {
          wx.showToast({ title: '记账成功', icon: 'success' });
          setTimeout(() => wx.navigateBack(), 600);
        })
        .catch(err => {
          console.error('Save failed:', err);
          wx.showToast({ title: '保存失败', icon: 'none' });
          this.setData({ saving: false });
        });
    }
  },

  deleteTransaction() {
    wx.showModal({
      title: '删除记录',
      content: '确定要删除这条记录吗？',
      success: (res) => {
        if (res.confirm) {
          db.collection('transactions').doc(this.data.editId).remove()
            .then(() => {
              wx.showToast({ title: '已删除', icon: 'success' });
              setTimeout(() => wx.navigateBack(), 600);
            })
            .catch(err => {
              console.error('Delete failed:', err);
              wx.showToast({ title: '删除失败', icon: 'none' });
            });
        }
      }
    });
  },

  loadCustomCategories() {
    const nickName = app.globalData.nickName;
    return db.collection('categories').where({ nickName }).get()
      .then(res => {
        this.setData({ customCategories: res.data });
        this.mergeCategories();
      })
      .catch(err => {
        if (err.errCode !== -502005) console.error('Load categories failed:', err);
        this.setData({ customCategories: [] });
        this.mergeCategories();
      });
  },

  mergeCategories() {
    const type = this.data.type;
    const base = type === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
    const custom = this.data.customCategories.filter(c => c.type === type);
    const merged = [...base, ...custom];
    this.setData({ categories: merged });
  },

  openCategoryForm(e) {
    const type = e.currentTarget.dataset.type || this.data.type;
    this.setData({
      showCategoryForm: true,
      categoryFormType: type,
      newCategoryName: '',
      newCategoryEmoji: '📌'
    });
  },

  closeCategoryForm() {
    this.setData({ showCategoryForm: false });
  },

  onCategoryNameInput(e) {
    this.setData({ newCategoryName: e.detail.value });
  },

  selectCategoryEmoji(e) {
    this.setData({ newCategoryEmoji: e.currentTarget.dataset.emoji });
  },

  saveCategory() {
    const { newCategoryName, newCategoryEmoji, categoryFormType } = this.data;
    const name = newCategoryName.trim();
    if (!name) {
      wx.showToast({ title: '请输入分类名称', icon: 'none' });
      return;
    }

    const nickName = app.globalData.nickName;
    db.collection('categories').add({
      data: {
        name,
        emoji: newCategoryEmoji,
        type: categoryFormType,
        nickName,
        createTime: new Date()
      }
    }).then(() => {
      wx.showToast({ title: '分类已添加', icon: 'success' });
      this.setData({ showCategoryForm: false });
      this.loadCustomCategories();
    }).catch(err => {
      console.error('Save category failed:', err);
      wx.showToast({ title: '添加失败', icon: 'none' });
    });
  },

  deleteCategory(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除分类',
      content: '确定要删除这个自定义分类吗？',
      success: (res) => {
        if (res.confirm) {
          db.collection('categories').doc(id).remove()
            .then(() => {
              wx.showToast({ title: '已删除', icon: 'success' });
              this.loadCustomCategories();
            })
            .catch(err => {
              console.error('Delete category failed:', err);
              wx.showToast({ title: '删除失败', icon: 'none' });
            });
        }
      }
    });
  }
});
