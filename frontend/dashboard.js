
const API = "/api";

let currentBusiness = null;
let currentQueue = [];

async function apiRequest(endpoint, options = {}) {
    const response = await fetch(`${API}${endpoint}`, {
        credentials: "same-origin",
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
        }
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || data.error || "Request failed");
    }

    return data;
}

function getCustomers(data) {
    if (Array.isArray(data)) return data;
    return data.customers || data.queue || data.rows || [];
}

async function loadBusiness() {
    try {
        const data = await apiRequest("/business/me");
        currentBusiness = data.business || data;

        document.getElementById("businessName").textContent =
            currentBusiness.business_name || currentBusiness.businessName || "Your Business";

        document.getElementById("businessEmail").textContent =
            currentBusiness.email || "";

        createBusinessQR();
    } catch (error) {
        window.location.href = "index.html";
    }
}

function createBusinessQR() {
    if (!currentBusiness) return;

    const businessId = currentBusiness.business_id || currentBusiness.businessId;

    if (!businessId || typeof QRCode === "undefined") {
        document.getElementById("qrMessage").textContent =
            "Could not generate QR code.";
        return;
    }

    const customerURL = `${window.location.origin}/customer.html?business=${encodeURIComponent(businessId)}`;

    const qrArea = document.getElementById("qrcode");
    qrArea.innerHTML = "";

    new QRCode(qrArea, {
        text: customerURL,
        width: 180,
        height: 180,
        colorDark: "#26352d",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
    });
}

async function loadQueue() {
    const message = document.getElementById("queueMessage");

    try {
        const data = await apiRequest("/business/queue");
        currentQueue = getCustomers(data);

        renderQueue();
        updateStats(data);
        message.textContent = "";
    } catch (error) {
        message.textContent = error.message;
    }
}

function renderQueue() {
    const body = document.getElementById("queueBody");
    body.innerHTML = "";

    if (currentQueue.length === 0) {
        body.innerHTML = '<tr><td colspan="3">No customers in the queue yet.</td></tr>';
        return;
    }

    currentQueue.forEach(customer => {
        const token = customer.token || customer.token_number || "—";
        const formattedToken = typeof token === "number"
            ? `A${String(token).padStart(3, "0")}`
            : token;

        const row = document.createElement("tr");

        const tokenCell = document.createElement("td");
        tokenCell.textContent = formattedToken;

        const nameCell = document.createElement("td");
        nameCell.textContent = customer.customer_name || customer.name || "";

        const statusCell = document.createElement("td");
        const status = customer.status || "Waiting";
        const statusLabel = document.createElement("span");
        statusLabel.className = `status ${status}`;
        statusLabel.textContent = status;
        statusCell.appendChild(statusLabel);

        row.append(tokenCell, nameCell, statusCell);
        body.appendChild(row);
    });
}

function updateStats(data) {
    const waiting = currentQueue.filter(c => c.status === "Waiting").length;
    const servingCustomer = currentQueue.find(c => c.status === "Serving");

    document.getElementById("waitingCount").textContent = waiting;
    document.getElementById("totalCount").textContent = currentQueue.length;

    const serving = data.currentServing ||
        data.current_serving ||
        (servingCustomer && (servingCustomer.token || servingCustomer.token_number));

    document.getElementById("servingToken").textContent =
        serving ? (typeof serving === "number"
            ? `A${String(serving).padStart(3, "0")}`
            : serving) : "—";
}

async function performAction(endpoint) {
    const message = document.getElementById("queueMessage");

    try {
        await apiRequest(endpoint, { method: "POST" });
        message.textContent = "Queue updated successfully.";
        await loadQueue();
    } catch (error) {
        message.textContent = error.message;
    }
}

document.getElementById("callNextButton").addEventListener("click", () => {
    performAction("/business/call-next");
});

document.getElementById("completeButton").addEventListener("click", () => {
    performAction("/business/complete-current");
});

document.getElementById("skipButton").addEventListener("click", () => {
    performAction("/business/skip-current");
});

document.getElementById("refreshButton").addEventListener("click", loadQueue);

document.getElementById("logoutButton").addEventListener("click", async () => {
    try {
        await apiRequest("/business/logout", { method: "POST" });
        window.location.href = "index.html";
    } catch (error) {
        alert(error.message);
    }
});

document.getElementById("downloadQRButton").addEventListener("click", () => {
    const qr = document.querySelector("#qrcode canvas");
    const image = document.querySelector("#qrcode img");
    const source = qr ? qr.toDataURL("image/png") : image?.src;

    if (!source) {
        document.getElementById("qrMessage").textContent =
            "Generate your QR code first.";
        return;
    }

    const link = document.createElement("a");
    link.href = source;
    link.download = "SmartQueue-Business-QR.png";
    link.click();
});

async function startDashboard() {
    await loadBusiness();

    if (currentBusiness) {
        await loadQueue();
        setInterval(loadQueue, 5000);
    }
}

startDashboard();

