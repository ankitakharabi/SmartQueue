
const API = "/api";

const params = new URLSearchParams(window.location.search);
const businessId = params.get("business");

let ticketId = null;
let refreshInterval = null;

const joinPanel = document.getElementById("joinPanel");
const ticketPanel = document.getElementById("ticketPanel");
const joinForm = document.getElementById("joinForm");
const joinButton = document.getElementById("joinButton");

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
        throw new Error(data.message || data.error || "Something went wrong");
    }

    return data;
}

async function loadBusiness() {
    if (!businessId) {
        document.getElementById("businessName").textContent =
            "Invalid business QR code";
        joinPanel.hidden = true;
        return;
    }

    try {
        const data = await apiRequest(
            `/business/public/${encodeURIComponent(businessId)}`
        );

        const business = data.business || data;

        document.getElementById("businessName").textContent =
            business.business_name || "Business";

        document.title = `SmartQueue | ${business.business_name}`;

    } catch (error) {
        document.getElementById("businessName").textContent =
            "Business not found";

        document.getElementById("businessDescription").textContent =
            error.message;

        joinPanel.hidden = true;
    }
}

joinForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = document.getElementById("customerName").value.trim();
    const message = document.getElementById("joinMessage");

    if (!name || !businessId) return;

    joinButton.disabled = true;
    message.textContent = "Joining queue...";

    try {
        const data = await apiRequest("/customer/join", {
            method: "POST",
            body: JSON.stringify({
                name,
                businessId
            })
        });

        ticketId = data.ticketId;

        if (!ticketId) {
            throw new Error("Ticket ID was not returned by the server.");
        }

        document.getElementById("ticketBusiness").textContent =
            document.getElementById("businessName").textContent;

        document.getElementById("ticketName").textContent = name;
        document.getElementById("ticketToken").textContent =
            data.token || "—";

        joinPanel.hidden = true;
        ticketPanel.hidden = false;

        await loadTicket();

        refreshInterval = setInterval(loadTicket, 5000);

    } catch (error) {
        message.textContent = error.message;
        joinButton.disabled = false;
    }
});

async function loadTicket() {
    if (!ticketId) return;

    const message = document.getElementById("ticketMessage");

    try {
        const data = await apiRequest(
            `/customer/ticket/${encodeURIComponent(ticketId)}`
        );

        const ticket = data.ticket;

        if (!ticket) {
            throw new Error("Ticket information was not returned.");
        }

        document.getElementById("ticketToken").textContent =
            ticket.token || "—";

        document.getElementById("ticketName").textContent =
            ticket.customerName || "—";

        document.getElementById("peopleAhead").textContent =
            ticket.peopleAhead ?? "—";

        document.getElementById("currentlyServing").textContent =
            ticket.currentServing || "—";

        const status = ticket.status || "Waiting";

        document.getElementById("ticketStatus").textContent = status;

        if (status === "Completed") {
            message.textContent =
                "Your queue service has been completed.";
            clearInterval(refreshInterval);

        } else if (status === "Skipped") {
            message.textContent =
                "Your ticket has been marked as skipped. Please contact the business.";
            clearInterval(refreshInterval);

        } else if (status === "Serving") {
            message.textContent =
                "It's your turn! Please proceed to the business counter.";

        } else {
            message.textContent =
                "Your ticket is active. This page updates automatically.";
        }

    } catch (error) {
        message.textContent =
            "Unable to refresh your ticket: " + error.message;
    }
}

loadBusiness();
