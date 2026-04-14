/*
  Paste your deployed Google Apps Script Web App URL below.
  Example:
  const API_URL = "https://script.google.com/macros/s/AKfycb.../exec";
*/
const API_URL = "https://script.google.com/macros/s/AKfycbwZ-IMY7XJDm_MojYeJvQaxiZnOp2I0Hm4rPYKMBrZLezY97sKoTXkcNIYvtaxkcAXH8A/exec";

const THEME_STORAGE_KEY = "accounts-management-theme";
const MAX_SCREENSHOT_SIZE_BYTES = 5 * 1024 * 1024;

const state = {
  transactions: [],
  filteredTransactions: []
};

const elements = {
  body: document.body,
  themeToggle: document.getElementById("themeToggle"),
  themeToggleLabel: document.getElementById("themeToggleLabel"),
  themeToggleIcon: document.getElementById("themeToggleIcon"),
  transactionForm: document.getElementById("transactionForm"),
  submitButton: document.getElementById("submitButton"),
  refreshButton: document.getElementById("refreshButton"),
  exportButton: document.getElementById("exportButton"),
  resetFiltersButton: document.getElementById("resetFiltersButton"),
  formMessage: document.getElementById("formMessage"),
  axisBalance: document.getElementById("axisBalance"),
  kvbBalance: document.getElementById("kvbBalance"),
  totalSent: document.getElementById("totalSent"),
  totalReceived: document.getElementById("totalReceived"),
  historyBody: document.getElementById("historyBody"),
  loadingState: document.getElementById("loadingState"),
  emptyState: document.getElementById("emptyState"),
  errorState: document.getElementById("errorState"),
  errorText: document.getElementById("errorText"),
  recordCount: document.getElementById("recordCount"),
  filterType: document.getElementById("filterType"),
  filterAccount: document.getElementById("filterAccount"),
  filterFromDate: document.getElementById("filterFromDate"),
  filterToDate: document.getElementById("filterToDate"),
  searchName: document.getElementById("searchName")
};

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value) || 0);

const formatDisplayDate = (value) => {
  if (!value) {
    return "-";
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(parsedDate);
};

const formatDateTime = (value) => {
  if (!value) {
    return "-";
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(parsedDate);
};

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[character]));

const hasConfiguredApiUrl = () =>
  API_URL && !API_URL.includes("PASTE_YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE");

const setLoading = (isLoading) => {
  elements.loadingState.hidden = !isLoading;
  elements.refreshButton.disabled = isLoading;
  elements.submitButton.disabled = isLoading;
  elements.exportButton.disabled = isLoading;
};

const setFormMessage = (message, type = "") => {
  elements.formMessage.textContent = message;
  elements.formMessage.className = "form-message";

  if (type) {
    elements.formMessage.classList.add(type);
  }
};

const setErrorState = (message = "") => {
  const hasError = Boolean(message);
  elements.errorState.hidden = !hasError;
  elements.errorText.textContent = message || "";
};

const toggleEmptyState = (isVisible) => {
  elements.emptyState.hidden = !isVisible;
};

const getIsoTimestamp = () => new Date().toISOString();

const normalizeTransaction = (item) => ({
  type: String(item.Type || item.type || "").trim().toUpperCase(),
  name: String(item.Name || item.name || "").trim(),
  amount: Number(item.Amount || item.amount || 0),
  account: String(item.Account || item.account || "").trim().toUpperCase(),
  date: String(item.Date || item.date || "").trim(),
  logTime: String(item.LogTime || item.logTime || "").trim(),
  screenshot: String(item.Screenshot || item.screenshot || "").trim()
});

const isValidType = (value) => ["SENT", "RECEIVED"].includes(value);
const isValidAccount = (value) => ["AXIS", "KVB"].includes(value);

const validateFormData = (formData) => {
  if (!isValidType(formData.type)) {
    return "Please choose a valid transaction type.";
  }

  if (!formData.name.trim()) {
    return "Particulars are required.";
  }

  if (!Number.isFinite(Number(formData.amount)) || Number(formData.amount) <= 0) {
    return "Amount must be greater than 0.";
  }

  if (!isValidAccount(formData.account)) {
    return "Please choose a valid account.";
  }

  if (!formData.date) {
    return "Transaction date is required.";
  }

  if (formData.screenshotFile && formData.screenshotFile.size > MAX_SCREENSHOT_SIZE_BYTES) {
    return "Screenshot must be 5 MB or smaller.";
  }

  return "";
};

const readFileAsBase64 = (file) =>
  new Promise((resolve, reject) => {
    if (!file) {
      resolve(null);
      return;
    }

    const reader = new FileReader();

    reader.addEventListener("load", () => {
      const result = String(reader.result || "");
      const base64 = result.includes(",") ? result.split(",")[1] : result;

      resolve({
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        base64
      });
    });

    reader.addEventListener("error", () => {
      reject(new Error("Unable to read selected screenshot."));
    });

    reader.readAsDataURL(file);
  });

const calculateSummary = (transactions) => {
  const summary = {
    axisBalance: 0,
    kvbBalance: 0,
    totalSent: 0,
    totalReceived: 0
  };

  transactions.forEach((transaction) => {
    if (!isValidType(transaction.type) || !isValidAccount(transaction.account)) {
      return;
    }

    if (transaction.type === "SENT") {
      summary.totalSent += transaction.amount;

      if (transaction.account === "AXIS") {
        summary.axisBalance -= transaction.amount;
      }

      if (transaction.account === "KVB") {
        summary.kvbBalance -= transaction.amount;
      }
    }

    if (transaction.type === "RECEIVED") {
      summary.totalReceived += transaction.amount;

      if (transaction.account === "AXIS") {
        summary.axisBalance += transaction.amount;
      }

      if (transaction.account === "KVB") {
        summary.kvbBalance += transaction.amount;
      }
    }
  });

  return summary;
};

const getTransactionTimestamp = (transaction) => {
  const parsed = new Date(transaction.logTime || transaction.date || 0).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

const getSignedAmount = (transaction) => {
  if (transaction.type === "RECEIVED") {
    return transaction.amount;
  }

  if (transaction.type === "SENT") {
    return -transaction.amount;
  }

  return 0;
};

const addCurrentBalances = (transactions) => {
  const balances = {
    AXIS: 0,
    KVB: 0
  };

  return transactions
    .map((transaction, index) => ({
      ...transaction,
      originalIndex: index
    }))
    .sort((left, right) => {
      const timeDifference = getTransactionTimestamp(left) - getTransactionTimestamp(right);
      return timeDifference || left.originalIndex - right.originalIndex;
    })
    .map((transaction) => {
      balances[transaction.account] += getSignedAmount(transaction);

      return {
        ...transaction,
        currentBalance: balances[transaction.account]
      };
    });
};

const renderSummary = () => {
  const summary = calculateSummary(state.transactions);
  elements.axisBalance.textContent = formatCurrency(summary.axisBalance);
  elements.kvbBalance.textContent = formatCurrency(summary.kvbBalance);
  elements.totalSent.textContent = formatCurrency(summary.totalSent);
  elements.totalReceived.textContent = formatCurrency(summary.totalReceived);
};

const renderTable = () => {
  const rows = state.filteredTransactions;
  elements.historyBody.innerHTML = "";
  elements.recordCount.textContent = `${rows.length} record${rows.length === 1 ? "" : "s"}`;
  toggleEmptyState(!rows.length && elements.errorState.hidden && elements.loadingState.hidden);

  if (!rows.length) {
    return;
  }

  const fragment = document.createDocumentFragment();

  rows.forEach((transaction) => {
    const row = document.createElement("tr");
    const isReceived = transaction.type === "RECEIVED";
    const safeName = escapeHtml(transaction.name || "-");
    const safeAccount = escapeHtml(transaction.account || "-");
    const safeType = escapeHtml(transaction.type || "-");

    let screenshotMarkup = '<span class="muted">-</span>';

    if (transaction.screenshot) {
      const safeUrl = escapeHtml(transaction.screenshot);
      screenshotMarkup = `
        <a class="table-link" href="${safeUrl}" target="_blank" rel="noopener noreferrer">
          View
        </a>
      `;
    }

    row.innerHTML = `
      <td data-label="Type"><span class="badge ${isReceived ? "received" : "sent"}">${safeType}</span></td>
      <td data-label="Particulars">${safeName}</td>
      <td data-label="Amount"><span class="amount ${isReceived ? "received" : "sent"}">${formatCurrency(transaction.amount)}</span></td>
      <td data-label="Account">${safeAccount}</td>
      <td data-label="Current Balance"><span class="amount ${transaction.currentBalance >= 0 ? "received" : "sent"}">${formatCurrency(transaction.currentBalance)}</span></td>
      <td data-label="Transaction Date">${escapeHtml(formatDisplayDate(transaction.date))}</td>
      <td data-label="LogTime">${escapeHtml(formatDateTime(transaction.logTime))}</td>
      <td data-label="Screenshot">${screenshotMarkup}</td>
    `;

    fragment.appendChild(row);
  });

  elements.historyBody.appendChild(fragment);
};

const getDateValue = (value, endOfDay = false) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(endOfDay ? `${value}T23:59:59` : `${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const applyFilters = () => {
  const filterType = elements.filterType.value;
  const filterAccount = elements.filterAccount.value;
  const fromDate = getDateValue(elements.filterFromDate.value);
  const toDate = getDateValue(elements.filterToDate.value, true);
  const searchName = elements.searchName.value.trim().toLowerCase();

  state.filteredTransactions = state.transactions.filter((transaction) => {
    const matchesType = filterType === "ALL" || transaction.type === filterType;
    const matchesAccount = filterAccount === "ALL" || transaction.account === filterAccount;
    const matchesName = !searchName || transaction.name.toLowerCase().includes(searchName);

    const transactionDate = transaction.date ? new Date(`${transaction.date}T00:00:00`) : null;
    const hasValidTransactionDate = transactionDate && !Number.isNaN(transactionDate.getTime());
    const matchesFromDate = !fromDate || (hasValidTransactionDate && transactionDate >= fromDate);
    const matchesToDate = !toDate || (hasValidTransactionDate && transactionDate <= toDate);

    return matchesType && matchesAccount && matchesName && matchesFromDate && matchesToDate;
  });

  renderTable();
};

const resetFilters = () => {
  elements.filterType.value = "ALL";
  elements.filterAccount.value = "ALL";
  elements.filterFromDate.value = "";
  elements.filterToDate.value = "";
  elements.searchName.value = "";
  applyFilters();
};

const sortTransactions = (transactions) =>
  [...transactions].sort((left, right) => {
    const leftTime = new Date(left.logTime || left.date || 0).getTime();
    const rightTime = new Date(right.logTime || right.date || 0).getTime();
    return rightTime - leftTime;
  });

const getExportRows = () =>
  state.filteredTransactions.map((transaction) => ({
    Type: transaction.type,
    Particulars: transaction.name,
    Amount: transaction.amount,
    Account: transaction.account,
    "Current Balance": transaction.currentBalance,
    "Transaction Date": formatDisplayDate(transaction.date),
    LogTime: formatDateTime(transaction.logTime),
    Screenshot: transaction.screenshot || ""
  }));

const escapeCsvValue = (value) => {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const downloadBlob = (blob, fileName) => {
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.href = url;
  link.download = fileName;
  link.target = "_blank";
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
};

const exportFilteredTransactions = async () => {
  const rows = getExportRows();

  if (!rows.length) {
    setErrorState("No filtered transaction records available to export.");
    return;
  }

  setErrorState("");

  const headers = Object.keys(rows[0]);
  const csvRows = [
    headers.map(escapeCsvValue).join(","),
    ...rows.map((row) => headers.map((header) => escapeCsvValue(row[header])).join(","))
  ];
  const fileName = `filtered-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
  const blob = new Blob([`\uFEFF${csvRows.join("\r\n")}`], {
    type: "text/csv;charset=utf-8"
  });

  if (navigator.canShare && navigator.share) {
    const file = new File([blob], fileName, { type: "text/csv" });

    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: "Filtered transaction records"
        });
        return;
      } catch (error) {
        if (error.name === "AbortError") {
          return;
        }
      }
    }
  }

  downloadBlob(blob, fileName);
};

const parseTransactionsResponse = async (response) => {
  const contentType = response.headers.get("content-type") || "";

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error("API did not return valid JSON.");
  }
};

const fetchTransactions = async () => {
  if (!hasConfiguredApiUrl()) {
    state.transactions = [];
    state.filteredTransactions = [];
    renderSummary();
    setLoading(false);
    setErrorState("Paste your Google Apps Script Web App URL in script.js to load and save transaction records.");
    renderTable();
    return;
  }

  setLoading(true);
  setErrorState("");

  try {
    const response = await fetch(API_URL, {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    });

    const result = await parseTransactionsResponse(response);
    const rows = Array.isArray(result)
      ? result
      : result.data || result.transactions || result.records || [];

    const validTransactions = rows
      .map(normalizeTransaction)
      .filter((transaction) =>
        isValidType(transaction.type) &&
        transaction.name &&
        Number.isFinite(transaction.amount) &&
        isValidAccount(transaction.account)
      );

    state.transactions = sortTransactions(addCurrentBalances(validTransactions));

    renderSummary();
  } catch (error) {
    state.transactions = [];
    state.filteredTransactions = [];
    renderSummary();
    setErrorState(error.message || "Unable to fetch transaction records.");
  } finally {
    setLoading(false);
    applyFilters();
  }
};

const getFormValues = () => ({
  type: elements.transactionForm.type.value.trim(),
  name: elements.transactionForm.name.value.trim(),
  amount: elements.transactionForm.amount.value,
  account: elements.transactionForm.account.value.trim(),
  date: elements.transactionForm.date.value,
  screenshotFile: elements.transactionForm.screenshot.files[0] || null,
  logTime: getIsoTimestamp()
});

const submitTransaction = async (event) => {
  event.preventDefault();

  const formData = getFormValues();
  const validationMessage = validateFormData(formData);

  if (validationMessage) {
    setFormMessage(validationMessage, "error");
    return;
  }

  if (!hasConfiguredApiUrl()) {
    setFormMessage("Paste your Google Apps Script Web App URL in script.js before submitting.", "error");
    return;
  }

  setFormMessage("Saving transaction record...", "");
  elements.submitButton.disabled = true;

  try {
    const screenshotFile = await readFileAsBase64(formData.screenshotFile);
    const payload = {
      Type: formData.type,
      Name: formData.name,
      Amount: Number(formData.amount),
      Account: formData.account,
      Date: formData.date,
      LogTime: formData.logTime,
      ScreenshotFile: screenshotFile
    };

    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
        Accept: "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Save failed with status ${response.status}`);
    }

    setFormMessage("Transaction record saved successfully.", "success");
    elements.transactionForm.reset();
    elements.transactionForm.date.value = new Date().toISOString().slice(0, 10);
    await fetchTransactions();
  } catch (error) {
    setFormMessage(error.message || "Unable to save transaction record.", "error");
  } finally {
    elements.submitButton.disabled = false;
  }
};

const applyTheme = (theme) => {
  const isDark = theme === "dark";
  elements.body.classList.toggle("dark", isDark);
  elements.themeToggleLabel.textContent = isDark ? "Light mode" : "Dark mode";
  elements.themeToggleIcon.textContent = isDark ? "L" : "D";
  localStorage.setItem(THEME_STORAGE_KEY, theme);
};

const initializeTheme = () => {
  const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  const theme = storedTheme || "light";
  applyTheme(theme);
};

const setDefaultTransactionDate = () => {
  elements.transactionForm.date.value = new Date().toISOString().slice(0, 10);
};

const initializeEventListeners = () => {
  elements.transactionForm.addEventListener("submit", submitTransaction);
  elements.refreshButton.addEventListener("click", fetchTransactions);
  elements.exportButton.addEventListener("click", exportFilteredTransactions);
  elements.resetFiltersButton.addEventListener("click", resetFilters);

  elements.themeToggle.addEventListener("click", () => {
    const nextTheme = elements.body.classList.contains("dark") ? "light" : "dark";
    applyTheme(nextTheme);
  });

  [
    elements.filterType,
    elements.filterAccount,
    elements.filterFromDate,
    elements.filterToDate,
    elements.searchName
  ].forEach((element) => {
    element.addEventListener("input", applyFilters);
    element.addEventListener("change", applyFilters);
  });
};

const initializeApp = () => {
  initializeTheme();
  setDefaultTransactionDate();
  initializeEventListeners();
  renderSummary();
  fetchTransactions();
};

initializeApp();
